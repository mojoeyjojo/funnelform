import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveFollowUpSender } from "@/lib/email";
import { enqueue, processJobsByIds } from "@/lib/delivery/outbox";
import type { NewJob } from "@/lib/delivery/outbox";
import type { FollowUpConfig } from "@/lib/delivery/templates";
import type { QuizDestination } from "@/lib/types";

export const runtime = "nodejs";

// Lead capture from the public player. Unauthenticated visitor -> session-less
// admin client. GDPR: consent is required (EU market, build spec §8). Writes the
// lead row (with denormalized owner_id, looked up from the quiz) + a
// `lead_captured` quiz_event. Delivery (owner-notify, webhook, follow-up email)
// is enqueued and processed asynchronously via after() so a delivery failure
// can never block or fail the lead capture response.
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
      .select("owner_id, status, title, config, delivery, slug")
      .eq("id", quiz_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!quiz || quiz.status !== "published") {
      return NextResponse.json({ error: "Quiz not available" }, { status: 404 });
    }

    // Authoritative lead INSERT. Returns the new row id so delivery jobs can
    // reference it. An error here aborts the request; delivery is never reached.
    const { data: inserted, error: insertError } = await admin
      .from("leads")
      .insert({
        quiz_id,
        owner_id: quiz.owner_id,
        name: cleanName,
        email,
        phone: phone ?? null,
        answers,
        outcome_id: outcome_id ?? null,
      })
      .select("id")
      .single();
    if (insertError) {
      console.error("[leads] insert failed:", insertError.message);
      return NextResponse.json({ error: "Could not save your details" }, { status: 500 });
    }
    const leadId = inserted.id as string;

    await admin.from("quiz_events").insert({
      quiz_id,
      event_type: "lead_captured",
      session_id,
    });

    // Resolve the matched outcome once: owner-notify + follow-up email use its
    // name, and the follow-up link uses its CTA url (the owner's offer/booking
    // link). baseUrl is the canonical host for on-platform links: APP_BASE_URL in
    // production (so emails never point at a preview/localhost host), request
    // origin as the local-dev fallback.
    const baseUrl = process.env.APP_BASE_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
    const outcomes =
      (quiz.config as { outcomes?: { id: string; name: string; cta?: { url?: string } }[] } | null)
        ?.outcomes ?? [];
    const matchedOutcome = outcomes.find((o) => o.id === outcome_id) ?? null;
    const outcomeName = matchedOutcome?.name ?? null;
    // Empty when the outcome has no CTA. The editor warns and the AI draft omits
    // {{cta_link}} for CTA-less outcomes, so an empty link should be rare.
    const ctaLink = matchedOutcome?.cta?.url?.trim() ?? "";

    // Look up owner email once; reused for owner_notify job and follow-up sender.
    const { data: owner } = await admin
      .from("profiles")
      .select("email")
      .eq("id", quiz.owner_id)
      .maybeSingle();
    const ownerEmail = owner?.email ?? null;

    // Build the delivery jobs array. All three job types are optional:
    // owner_notify fires when an owner email is known, webhook fires when a
    // webhook URL is configured, and follow_up_email fires when follow-up is
    // enabled and the lead's outcome has a matching template.
    const delivery = (quiz.delivery ?? {}) as {
      webhook?: string;
      followUp?: FollowUpConfig;
      destinations?: QuizDestination[];
    };
    const jobs: NewJob[] = [];

    if (ownerEmail) {
      jobs.push({
        lead_id: leadId,
        owner_id: quiz.owner_id,
        kind: "owner_notify",
        payload: {
          ownerEmail,
          quizTitle: quiz.title ?? "your quiz",
          leadName: cleanName,
          leadEmail: email,
          leadPhone: phone ?? null,
          outcomeName,
          leadsUrl: `${baseUrl}/leads/${quiz_id}`,
        },
      });
    }

    if (typeof delivery.webhook === "string" && delivery.webhook) {
      jobs.push({
        lead_id: leadId,
        owner_id: quiz.owner_id,
        kind: "webhook",
        target: delivery.webhook,
        payload: {
          url: delivery.webhook,
          body: {
            quiz_id,
            name: cleanName,
            email,
            phone: phone ?? null,
            answers,
            outcome_id: outcome_id ?? null,
            outcome_name: outcomeName,
            created_at: new Date().toISOString(),
          },
        },
      });
    }

    const followUp = delivery.followUp;
    const outcomeTemplate = followUp?.enabled && outcome_id ? followUp.outcomes?.[outcome_id] : undefined;
    if (outcomeTemplate) {
      const sender = resolveFollowUpSender({
        mode: followUp!.sender?.mode ?? "subdomain",
        brandName: quiz.title ?? "Treeflow",
        ownerEmail: ownerEmail ?? "",
        customFrom: null,
      });
      jobs.push({
        lead_id: leadId,
        owner_id: quiz.owner_id,
        kind: "follow_up_email",
        payload: {
          to: email,
          from: sender.from,
          replyTo: sender.replyTo,
          subject: outcomeTemplate.subject,
          html: outcomeTemplate.body,
          vars: {
            name: cleanName ?? "there",
            outcome: outcomeName ?? "",
            // The actionable link in the follow-up: the outcome's offer/booking
            // CTA. result_link is kept as an alias so older templates still work.
            cta_link: ctaLink,
            result_link: ctaLink,
            quiz_title: quiz.title ?? "",
            owner_name: quiz.title ?? "",
          },
        },
      });
    }

    for (const dest of delivery.destinations ?? []) {
      jobs.push({
        lead_id: leadId,
        owner_id: quiz.owner_id,
        kind: "esp_push",
        target: dest.integrationId,
        payload: {
          integrationId: dest.integrationId,
          targetId: dest.targetId,
          contact: {
            email,
            name: cleanName,
            // Tag the subscriber by outcome (and quiz title) so the owner can
            // segment. Empty entries are filtered so a missing outcome is fine.
            tags: [outcomeName, quiz.title].filter((t): t is string => Boolean(t)),
          },
        },
      });
    }

    // Enqueue is a single INSERT and completes synchronously before the response.
    // Actual sending (network I/O) runs inside after() so it never delays the
    // visitor response and a delivery failure cannot affect lead capture.
    // Delivery is best-effort and must never fail an already-saved lead. Isolate the
    // enqueue + after() setup so an unexpected error here cannot turn into a false 500.
    try {
      const jobIds = await enqueue(admin, jobs);
      after(async () => {
        await processJobsByIds(admin, jobIds);
      });
    } catch (deliveryErr) {
      console.error(
        "[leads] delivery setup failed:",
        deliveryErr instanceof Error ? deliveryErr.message : deliveryErr,
      );
    }
  } catch (err) {
    console.error("[leads] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not save your details" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
