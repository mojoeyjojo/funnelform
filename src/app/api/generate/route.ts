import { recordBuilderEvent } from "@/lib/events";
import { consumeGenerateLimit } from "@/lib/rateLimit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createGenerateStream, NDJSON_HEADERS, type GenerateBody } from "@/lib/generateStream";

export const runtime = "nodejs";
export const maxDuration = 60; // generation target is <30s; give headroom.

// Authed/landing generate endpoint. Signed-in users get a generous per-account
// daily cap; anonymous visitors a tighter per-IP one. The actual pipeline lives
// in createGenerateStream (shared with the free-tool /api/generate/anon).
export async function POST(req: Request) {
  let body: GenerateBody & { sessionId?: string };
  try {
    body = (await req.json()) as GenerateBody & { sessionId?: string };
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sessionId = (body.sessionId ?? "").trim() || "anon";

  // --- Rate limit BEFORE any AI work (cost/abuse protection, spec §8). ------
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
    return new Response(JSON.stringify({ type: "error", message }) + "\n", {
      status: 429,
      headers: NDJSON_HEADERS,
    });
  }

  return new Response(createGenerateStream({ body, sessionId }), { headers: NDJSON_HEADERS });
}
