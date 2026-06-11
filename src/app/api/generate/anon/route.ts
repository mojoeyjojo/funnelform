import { recordBuilderEvent } from "@/lib/events";
import { consumeFreeToolLimit, clientIpFromHeaders } from "@/lib/rateLimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { createGenerateStream, NDJSON_HEADERS, type GenerateBody } from "@/lib/generateStream";

export const runtime = "nodejs";
export const maxDuration = 60;

// Free-tool generation endpoint (spec §5.10). UNGATED (no auth), but defended:
// a Turnstile bot challenge + exactly 1 generation per IP per 24h (separate
// bucket, no regen). The config is streamed back to the client and held in
// localStorage only — this endpoint NEVER writes to user tables. Events are
// tagged source:"free_tool" so anon data stays on its own line.
export async function POST(req: Request) {
  let body: GenerateBody & { sessionId?: string; turnstileToken?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = (body.sessionId ?? "").trim() || "anon";

  // 1. Bot challenge (skipped if Turnstile isn't configured yet).
  const human = await verifyTurnstile(body.turnstileToken, clientIpFromHeaders(req.headers));
  if (!human) {
    return new Response(
      JSON.stringify({ type: "error", message: "Please complete the verification and try again." }) + "\n",
      { status: 403, headers: NDJSON_HEADERS },
    );
  }

  // 2. One free generation per IP per 24h — no regen; route to signup instead.
  const allowed = await consumeFreeToolLimit(req.headers);
  if (!allowed) {
    await recordBuilderEvent({
      eventType: "rate_limited",
      sessionId,
      metadata: { source: "free_tool", limit: 1 },
    });
    return new Response(
      JSON.stringify({
        type: "error",
        message: "You've used your free quiz. Create a free account to generate more.",
      }) + "\n",
      { status: 429, headers: NDJSON_HEADERS },
    );
  }

  return new Response(
    createGenerateStream({ body, sessionId, eventMeta: { source: "free_tool" } }),
    { headers: NDJSON_HEADERS },
  );
}
