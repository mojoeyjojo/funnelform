import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sendOwnerLeadNotification } from "@/lib/email";

export const runtime = "nodejs";

// Lead capture from the public player. Unauthenticated visitor → session-less
// admin client. GDPR: consent is required (EU market, build spec §8). Writes the
// lead row (with denormalized owner_id, looked up from the quiz) + a
// `lead_captured` quiz_event. Delivery to the owner's channel is Phase 3.
const LeadSchema = z.object({
  quiz_id: z.string().uuid(),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  answers: z.record(z.string(), z.string()),
  outcome_id: z.string().optional(),
  session_id: z.string().min(1).max(100),
  consent: z.literal(true), // must explicitly consent
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lead", details: parsed.error.flatten() }, { status: 422 });
  }

  const { quiz_id, email, phone, answers, outcome_id, session_id } = parsed.data;

  try {
    const admin = createSupabaseAdminClient();

    // The quiz must be published; pull owner + content for the FK and notification.
    const { data: quiz } = await admin
      .from("quizzes")
      .select("owner_id, status, title, config")
      .eq("id", quiz_id)
      .maybeSingle();
    if (!quiz || quiz.status !== "published") {
      return NextResponse.json({ error: "Quiz not available" }, { status: 404 });
    }

    const { error } = await admin.from("leads").insert({
      quiz_id,
      owner_id: quiz.owner_id,
      email,
      phone: phone ?? null,
      answers,
      outcome_id: outcome_id ?? null,
    });
    if (error) {
      console.error("[leads] insert failed:", error.message);
      return NextResponse.json({ error: "Could not save your details" }, { status: 500 });
    }

    await admin.from("quiz_events").insert({
      quiz_id,
      event_type: "lead_captured",
      session_id,
    });

    // Owner-notification email — the real Claim-3 proof (build spec §9). Look up
    // the owner's email + outcome name, send, and record `owner_notified` so the
    // loop-closing is observable on-platform. Never block the visitor on this.
    try {
      const { data: owner } = await admin
        .from("profiles")
        .select("email")
        .eq("id", quiz.owner_id)
        .maybeSingle();
      const outcomes = (quiz.config as { outcomes?: { id: string; name: string }[] } | null)?.outcomes ?? [];
      const outcomeName = outcomes.find((o) => o.id === outcome_id)?.name ?? null;
      if (owner?.email) {
        const sent = await sendOwnerLeadNotification({
          ownerEmail: owner.email,
          quizTitle: quiz.title ?? "your quiz",
          leadEmail: email,
          leadPhone: phone ?? null,
          outcomeName,
          leadsUrl: `${new URL(request.url).origin}/leads/${quiz_id}`,
        });
        if (sent) {
          await admin.from("builder_events").insert({
            owner_id: quiz.owner_id,
            quiz_id,
            event_type: "owner_notified",
            metadata: { channel: "email" },
          });
        }
      }
    } catch (notifyErr) {
      console.error("[leads] owner notify failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
    }
  } catch (err) {
    console.error("[leads] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not save your details" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
