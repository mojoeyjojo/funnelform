import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { sendOwnerLeadNotification } from "@/lib/email";
import { isSafeWebhookTarget } from "@/lib/ssrf";

export const runtime = "nodejs";

// Lead capture from the public player. Unauthenticated visitor → session-less
// admin client. GDPR: consent is required (EU market, build spec §8). Writes the
// lead row (with denormalized owner_id, looked up from the quiz) + a
// `lead_captured` quiz_event. Delivery to the owner's channel is Phase 3.
const LeadSchema = z.object({
  quiz_id: z.string().uuid(),
  // Optional server-side so a missing name never rejects a captured lead; the
  // player form asks for it (and requires it) for personalised follow-up.
  name: z.string().max(100).optional(),
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

  const { quiz_id, name, email, phone, answers, outcome_id, session_id } = parsed.data;
  const cleanName = name?.trim() || null;

  try {
    const admin = createSupabaseAdminClient();

    // The quiz must be published; pull owner + content for the FK and notification.
    const { data: quiz } = await admin
      .from("quizzes")
      .select("owner_id, status, title, config, delivery")
      .eq("id", quiz_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!quiz || quiz.status !== "published") {
      return NextResponse.json({ error: "Quiz not available" }, { status: 404 });
    }

    const { error } = await admin.from("leads").insert({
      quiz_id,
      owner_id: quiz.owner_id,
      name: cleanName,
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

    // Resolve the result name once: both the email and the webhook payload use it.
    const outcomes = (quiz.config as { outcomes?: { id: string; name: string }[] } | null)?.outcomes ?? [];
    const outcomeName = outcomes.find((o) => o.id === outcome_id)?.name ?? null;

    // Owner-notification email, the real Claim-3 proof (build spec §9). Look up
    // the owner's email, send, and record `owner_notified` so the loop-closing
    // is observable on-platform. Never block the visitor on this.
    try {
      const { data: owner } = await admin
        .from("profiles")
        .select("email")
        .eq("id", quiz.owner_id)
        .maybeSingle();
      if (owner?.email) {
        const sent = await sendOwnerLeadNotification({
          ownerEmail: owner.email,
          quizTitle: quiz.title ?? "your quiz",
          leadName: cleanName,
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

    // Owner-configured webhook delivery (Zapier / Make / raw catch hooks). POST
    // the lead JSON, fire-and-forget, on its own try/catch with a 5s timeout so a
    // slow or failing endpoint never affects the visitor response. Record
    // `owner_notified` on a 2xx so the delivery is observable on-platform.
    const webhook = (quiz.delivery as { webhook?: string } | null)?.webhook;
    // SSRF guard: only POST to a public https target (rejects metadata IPs,
    // localhost, and private ranges, resolving the host first). See lib/ssrf.
    if (typeof webhook === "string" && webhook && (await isSafeWebhookTarget(webhook))) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // Do not auto-follow redirects: a 3xx could point at an internal
            // host and bypass the pre-flight SSRF check.
            redirect: "manual",
            body: JSON.stringify({
              quiz_id,
              name: cleanName,
              email,
              phone: phone ?? null,
              answers,
              outcome_id: outcome_id ?? null,
              outcome_name: outcomeName,
              created_at: new Date().toISOString(),
            }),
            signal: controller.signal,
          });
          if (res.ok) {
            await admin.from("builder_events").insert({
              owner_id: quiz.owner_id,
              quiz_id,
              event_type: "owner_notified",
              metadata: { channel: "webhook" },
            });
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (hookErr) {
        console.error("[leads] webhook delivery failed:", hookErr instanceof Error ? hookErr.message : hookErr);
      }
    }
  } catch (err) {
    console.error("[leads] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not save your details" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
