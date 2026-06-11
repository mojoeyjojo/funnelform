import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Visitor-journey events from the public player. Unauthenticated, so writes go
// through the session-less admin client (RLS blocks anon writes by design).
const EventSchema = z.object({
  quiz_id: z.string().uuid(),
  event_type: z.enum(["view", "start", "question_answered", "completed"]),
  question_id: z.string().optional(),
  session_id: z.string().min(1).max(100),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = EventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid event" }, { status: 422 });
  }

  try {
    const admin = createSupabaseAdminClient();
    await admin.from("quiz_events").insert({
      quiz_id: parsed.data.quiz_id,
      event_type: parsed.data.event_type,
      question_id: parsed.data.question_id ?? null,
      session_id: parsed.data.session_id,
    });
  } catch (err) {
    console.error("[quiz-events] insert failed:", err instanceof Error ? err.message : err);
    // Never block the player on instrumentation.
  }
  return NextResponse.json({ ok: true });
}
