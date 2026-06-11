import { listBuilderEvents, recordBuilderEvent } from "@/lib/events";
import { CLIENT_EVENT_TYPES, type BuilderEventType } from "@/lib/types";

export const runtime = "nodejs";

// POST: record a client-side builder_event (first_output_viewed, output_rating,
// field_edited). The generate_* events are recorded server-side in /api/generate;
// the client may only record the view/rating/edit events.
export async function POST(req: Request) {
  let body: {
    sessionId?: string;
    eventType?: BuilderEventType;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = (body.sessionId ?? "").trim();
  const eventType = body.eventType;
  if (!sessionId) {
    return Response.json({ error: "sessionId required" }, { status: 400 });
  }
  if (!eventType || !CLIENT_EVENT_TYPES.includes(eventType)) {
    return Response.json({ error: "unsupported eventType" }, { status: 400 });
  }

  const ok = await recordBuilderEvent({
    sessionId,
    eventType,
    metadata: body.metadata ?? {},
  });
  return Response.json({ ok });
}

// GET: read back the builder_events for a session (the "Events recorded" panel).
export async function GET(req: Request) {
  const sessionId = new URL(req.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return Response.json({ error: "sessionId required" }, { status: 400 });
  }
  const events = await listBuilderEvents(sessionId);
  return Response.json({ events });
}
