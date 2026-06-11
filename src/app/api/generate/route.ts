import { generateQuiz } from "@/lib/anthropic";
import {
  THIN_SITE_WORD_THRESHOLD,
  fetchSiteMarkdown,
  looksLikeUrl,
  normalizeUrl,
  wordCount,
} from "@/lib/jina";
import { recordBuilderEvent } from "@/lib/events";
import { consumeGenerateLimit } from "@/lib/rateLimit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GenerateStreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // generation target is <30s; give headroom.

type GenerateBody = {
  sessionId?: string;
  input?: string; // URL or one-line description (first attempt)
  // Thin-site fallback (3 fields): provided instead of `input`.
  description?: { whatYouDo?: string; whoYouServe?: string; mainOffer?: string };
};

// The pipeline (build spec §4) streamed as NDJSON so the client's progress
// states reflect REAL pipeline phases, not a fake timer:
//   reading   -> Jina Reader fetch
//   writing   -> Claude generation + Zod validation/retry
//   validating-> final assembly, about to return
export async function POST(req: Request) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionId = (body.sessionId ?? "").trim() || "anon";
  const encoder = new TextEncoder();

  // --- Rate limit BEFORE any AI work (cost/abuse protection, spec §8). ------
  // Signed-in users (cookie session) get a per-account bucket; anonymous
  // visitors a tighter per-IP one. The limiter fails open on its own errors.
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // no session resolvable; treat as anonymous
  }
  const rate = await consumeGenerateLimit({ userId, headers: req.headers });
  if (!rate.allowed) {
    await recordBuilderEvent({
      eventType: "rate_limited",
      sessionId,
      metadata: { scope: rate.scope, limit: rate.limit },
    });
    const message =
      rate.scope === "anon"
        ? "You've used today's free generations. Create a free account for more, or come back tomorrow."
        : "You've hit today's generation limit. It resets within 24 hours.";
    // Same NDJSON shape the client already understands.
    return new Response(JSON.stringify({ type: "error", message }) + "\n", {
      status: 429,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (evt: GenerateStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(evt) + "\n"));

      try {
        await recordBuilderEvent({ eventType: "generate_started", sessionId });

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
              await recordBuilderEvent({
                eventType: "thin_site_fallback_shown",
                sessionId,
                metadata: { url },
              });
              send({ type: "thin_site" });
              controller.close();
              return;
            }
            // Cap scraped content to keep input tokens (and cost) bounded.
            businessContext = `Source URL: ${url}\n\nScraped site content:\n${markdown.slice(0, 8000)}`;
          } else {
            businessContext = `Business description: ${input}`;
          }
        }

        // --- Generate + strictly validate (one retry inside generateQuiz) ---
        send({ type: "stage", stage: "writing" });
        const { quiz, attempts } = await generateQuiz(businessContext);

        send({ type: "stage", stage: "validating" });
        await recordBuilderEvent({
          eventType: "generate_succeeded",
          sessionId,
          metadata: { attempts, retried: attempts > 1 },
        });

        send({ type: "done", title: quiz.title, config: quiz.config });
      } catch (err) {
        await recordBuilderEvent({
          eventType: "generate_failed",
          sessionId,
          metadata: { message: err instanceof Error ? err.message : String(err) },
        });
        send({
          type: "error",
          message: "We couldn't build your quiz this time. Please try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
