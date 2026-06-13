import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { sendTrialEndingReminder } from "@/lib/email";

export const runtime = "nodejs";

// GET /api/cron/trial-reminders — invoked by the Vercel cron (vercel.json)
// once a day. Finds Stripe subscriptions still trialing whose trial ends in
// the NEXT 24-48 HOURS and emails the owner a reminder before the charge.
//
// Why 24-48h and not exactly 24h: the cron runs daily (hobby-plan cadence), so
// a [now+24h, now+48h) window catches every trial exactly once while always
// giving at least a full day's notice. Stripe is the source of truth for
// trial_end; a builder_events `trial_reminder_sent` row (keyed on the
// subscription id) makes the job idempotent across reruns.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  const admin = createSupabaseAdminClient();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now + 24 * 3600;
  const windowEnd = now + 48 * 3600;

  let checked = 0;
  let reminded = 0;
  const skipped: string[] = [];

  // Trialing subscriptions are a tiny set; paginate through all of them and
  // filter on trial_end in code (the list endpoint can't filter on it).
  const subs = await stripe.subscriptions
    .list({ status: "trialing", limit: 100 })
    .autoPagingToArray({ limit: 1000 });

  for (const sub of subs) {
    checked += 1;
    if (!sub.trial_end || sub.trial_end < windowStart || sub.trial_end >= windowEnd) continue;

    // Already reminded for this subscription? (idempotency across reruns)
    const { data: prior } = await admin
      .from("builder_events")
      .select("id")
      .eq("event_type", "trial_reminder_sent")
      .eq("metadata->>subscription_id", sub.id)
      .limit(1)
      .maybeSingle();
    if (prior) continue;

    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const { data: profile } = await admin
      .from("profiles")
      .select("id, email")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (!profile?.email) {
      skipped.push(sub.id);
      continue;
    }

    // "$39/month" or "$390/year", straight from the subscription's price.
    const price = sub.items.data[0]?.price;
    const priceLabel =
      price?.unit_amount && price.recurring
        ? `$${(price.unit_amount / 100).toLocaleString("en-US")}/${price.recurring.interval}`
        : "Pro";

    const sent = await sendTrialEndingReminder({
      to: profile.email,
      endsAtIso: new Date(sub.trial_end * 1000).toISOString(),
      priceLabel,
      manageUrl: "https://funnelform.vercel.app/dashboard",
    });
    if (!sent) {
      skipped.push(sub.id);
      continue;
    }

    await admin.from("builder_events").insert({
      owner_id: profile.id,
      event_type: "trial_reminder_sent",
      metadata: {
        subscription_id: sub.id,
        trial_end: new Date(sub.trial_end * 1000).toISOString(),
      },
    });
    reminded += 1;
  }

  return NextResponse.json({ checked, reminded, skipped });
}
