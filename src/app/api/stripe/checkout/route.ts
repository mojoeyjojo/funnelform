import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe, isTrialEligible, proPriceId, TRIAL_DAYS } from "@/lib/stripe";
import { fetchPlanProfile } from "@/lib/plan";

export const runtime = "nodejs";

// POST /api/stripe/checkout — plain form POST from the pricing page (zero
// client JS). Creates a subscription Checkout Session and 303s the browser to
// Stripe. The webhook (not the success redirect) is what flips the plan.
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const form = await request.formData();
  const interval = form.get("interval") === "yearly" ? "yearly" : "monthly";
  const trigger = typeof form.get("trigger") === "string" ? String(form.get("trigger")) : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Guests can't subscribe: a guest user can be deleted by the transfer flow,
  // which would orphan the Stripe customer. Real account first.
  if (!user || user.is_anonymous) {
    return NextResponse.redirect(`${origin}/login?next=/pricing`, 303);
  }

  try {
    const stripe = getStripe();
    const profile = await fetchPlanProfile(supabase, user.id);

    // Create-or-reuse the Stripe customer, persisting the id immediately so
    // the webhook can resolve customer → profile even on the first event.
    let customerId = profile?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("id", user.id);
    }

    // First subscription ever for this customer → 14-day trial on the
    // subscription. Checkout still collects the card (its default with a
    // trial), so the charge lands automatically when the trial ends.
    const withTrial = await isTrialEligible(profile?.stripe_customer_id ?? null);

    await supabase.from("builder_events").insert({
      owner_id: user.id,
      event_type: "upgrade_clicked",
      metadata: { interval, trial: withTrial, ...(trigger ? { trigger } : {}) },
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: proPriceId(interval), quantity: 1 }],
      client_reference_id: user.id,
      subscription_data: {
        metadata: { user_id: user.id },
        ...(withTrial ? { trial_period_days: TRIAL_DAYS } : {}),
      },
      payment_method_collection: "always", // card upfront, even during trial
      allow_promotion_codes: true,
      success_url: `${origin}/dashboard?upgraded=1`,
      cancel_url: `${origin}/pricing?canceled=1`,
    });

    if (!session.url) throw new Error("Checkout session has no URL");
    return NextResponse.redirect(session.url, 303);
  } catch (err) {
    console.error("[stripe/checkout] failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${origin}/pricing?error=1`, 303);
  }
}
