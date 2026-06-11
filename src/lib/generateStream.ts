import { generateQuiz } from "./anthropic";
import {
  THIN_SITE_WORD_THRESHOLD,
  fetchSiteMarkdown,
  looksLikeUrl,
  normalizeUrl,
  wordCount,
} from "./jina";
import { recordBuilderEvent } from "./events";
import type { BuilderEventType, GenerateStreamEvent } from "./types";

export type GenerateBody = {
  input?: string; // URL or one-line description
  description?: { whatYouDo?: string; whoYouServe?: string; mainOffer?: string };
};

export const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store",
} as const;

// Shared NDJSON generation pipeline (build spec §4), used by BOTH the authed
// /api/generate and the ungated free-tool /api/generate/anon. Streams real
// pipeline phases (reading → writing → validating). `eventMeta` is merged into
// every builder_event so free-tool/anon events stay on a SEPARATE line from
// owner events (spec §5.10 — anon raters are a different population).
export function createGenerateStream({
  body,
  sessionId,
  eventMeta = {},
}: {
  body: GenerateBody;
  sessionId: string;
  eventMeta?: Record<string, unknown>;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const record = (eventType: BuilderEventType, metadata: Record<string, unknown> = {}) =>
    recordBuilderEvent({ eventType, sessionId, metadata: { ...metadata, ...eventMeta } });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (evt: GenerateStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(evt) + "\n"));

      try {
        await record("generate_started");

        // --- Resolve business context (scrape, description, or fallback) ---
        let businessContext: string;

        if (body.description) {
          const d = body.description;
          businessContext = [
            `What the business does: ${d.whatYouDo ?? ""}`,
            `Who they serve: ${d.whoYouServe ?? ""}`,
            `Main offer: ${d.mainOffer ?? ""}`,
          ].join("\n");
        } else {
          const input = (body.input ?? "").trim();
          if (!input) {
            send({ type: "error", message: "Please paste a URL or describe your business." });
            controller.close();
            return;
          }

          send({ type: "stage", stage: "reading" });

          if (looksLikeUrl(input)) {
            const url = normalizeUrl(input);
            let markdown = "";
            try {
              markdown = await fetchSiteMarkdown(url);
            } catch {
              markdown = ""; // treat fetch failure as a thin site -> fallback form
            }
            if (wordCount(markdown) < THIN_SITE_WORD_THRESHOLD) {
              await record("thin_site_fallback_shown", { url });
              send({ type: "thin_site" });
              controller.close();
              return;
            }
            businessContext = `Source URL: ${url}\n\nScraped site content:\n${markdown.slice(0, 8000)}`;
          } else {
            businessContext = `Business description: ${input}`;
          }
        }

        // --- Generate + strictly validate (one retry inside generateQuiz) ---
        send({ type: "stage", stage: "writing" });
        const { quiz, attempts } = await generateQuiz(businessContext);

        send({ type: "stage", stage: "validating" });
        await record("generate_succeeded", { attempts, retried: attempts > 1 });
        send({ type: "done", title: quiz.title, config: quiz.config });
      } catch (err) {
        await record("generate_failed", {
          message: err instanceof Error ? err.message : String(err),
        });
        send({ type: "error", message: "We couldn't build your quiz this time. Please try again." });
      } finally {
        controller.close();
      }
    },
  });
}
