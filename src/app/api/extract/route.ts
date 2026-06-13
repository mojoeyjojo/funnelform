import { recordBuilderEvent } from "@/lib/events";
import { consumeExtractLimit } from "@/lib/rateLimit";
import { extractSiteFacts } from "@/lib/anthropic";
import {
  THIN_SITE_WORD_THRESHOLD,
  fetchSiteMarkdown,
  looksLikeUrl,
  normalizeUrl,
  wordCount,
} from "@/lib/jina";
import { isGoal, type ExtractResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Pre-generation extraction (Flow A). Scrapes the URL ONCE, pulls a few
// goal-relevant facts with a cheap Haiku pass, and returns them for the
// extraction-display card. The scraped markdown rides back as `siteContent` so
// the follow-up /api/generate call reuses it instead of fetching the page again.
//
// This is NOT the signup wall — that stays on /api/generate. A thin site (or a
// tripped abuse ceiling) returns `{ thin: true }` so the client routes the user
// into describing their business instead, carrying their goal across.
export async function POST(req: Request) {
  let body: { input?: string; goal?: string; sessionId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = (body.input ?? "").trim();
  if (!input || !looksLikeUrl(input)) {
    return Response.json({ error: "A website URL is required." }, { status: 400 });
  }
  if (!isGoal(body.goal)) {
    return Response.json({ error: "A valid goal is required." }, { status: 400 });
  }
  const goal = body.goal;
  const sessionId = (body.sessionId ?? "").trim() || "anon";

  // Abuse ceiling only. Over the cap -> skip the preview, let them proceed.
  if (!(await consumeExtractLimit(req.headers))) {
    return Response.json({ thin: true } satisfies ExtractResult);
  }

  const url = normalizeUrl(input);
  let markdown = "";
  try {
    markdown = await fetchSiteMarkdown(url);
  } catch {
    markdown = "";
  }
  if (wordCount(markdown) < THIN_SITE_WORD_THRESHOLD) {
    await recordBuilderEvent({
      eventType: "thin_site_fallback_shown",
      sessionId,
      metadata: { url, phase: "extract" },
    });
    return Response.json({ thin: true } satisfies ExtractResult);
  }

  try {
    const facts = await extractSiteFacts(markdown, goal);
    return Response.json({
      ...facts,
      siteContent: markdown.slice(0, 8000),
    } satisfies ExtractResult);
  } catch {
    // Extraction is a nicety, not a gate: if it fails, tell the client to skip
    // the preview and go straight to generation (which will scrape on its own).
    return Response.json({ error: "extract_failed" }, { status: 502 });
  }
}
