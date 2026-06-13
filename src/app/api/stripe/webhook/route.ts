import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

// POST /api/stripe/webhook — the ONLY writer of profiles.plan. Everything else
// (trial expiry included) is computed at read time via effectivePlan(). Keeping
// a single writer makes the billing state impossible to fork: Stripe is the
// source of truth, this route mirrors it.
//
// Verified with the raw body + signature header; admin client because Stripe
// has no user session.

// Subscription status → plan column value.
function planForStatus(status: Stripe.Subscription.Status): "pro" | "free" {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due": // grace period: Stripe retries the payment
      return "pro";
    default: // canceled | unpaid | incomplete | incomplete_expired | paused
      return "free";
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error("[stripe/webhook] bad signature:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") break;
        await setPlan({
          customerId: typeof session.customer === "string" ? session.customer : null,
          userId: session.client_reference_id,
          plan: "pro",
          stripeEvent: event.type,
        });
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await setPlan({
          customerId: typeof sub.customer === "string" ? sub.customer : null,
          userId: (sub.metadata?.user_id as string | undefined) ?? null,
          plan: event.type === "customer.subscription.deleted" ? "free" : planForStatus(sub.status),
          stripeEvent: event.type,
        });
        break;
      }
      default:
        break; // unrecognized events are acknowledged, not errors
    }
  } catch (err) {
    // Log but still 200: Stripe retries 4xx/5xx for days, and a permanently
    // failing handler (e.g. deleted user) would just spam retries.
    console.error("[stripe/webhook] handler failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ received: true });
}

// Resolve the profile (stripe_customer_id first, metadata user_id fallback
// with customer-id backfill) and update the plan, idempotently: a replayed
// event finds plan already equal and writes nothing, including no duplicate
// plan_changed builder_event.
async function setPlan(args: {
  customerId: string | null;
  userId: string | null;
  plan: "pro" | "free";
  stripeEvent: string;
}) {
  const admin = createSupabaseAdminClient();

  let profile: { id: string; plan: string } | null = null;
  if (args.customerId) {
    const { data } = await admin
      .from("profiles")
      .select("id, plan")
      .eq("stripe_customer_id", args.customerId)
      .maybeSingle();
    profile = data;
  }
  if (!profile && args.userId) {
    const { data } = await admin
      .from("profiles")
      .select("id, plan")
      .eq("id", args.userId)
      .maybeSingle();
    profile = data;
    // Backfill the customer id so future events resolve directly.
    if (profile && args.customerId) {
      await admin
        .from("profiles")
        .update({ stripe_customer_id: args.customerId })
        .eq("id", profile.id);
    }
  }
  if (!profile) {
    console.error("[stripe/webhook] no profile for customer", args.customerId, "user", args.userId);
    return;
  }

  if (profile.plan === args.plan) return; // idempotency: nothing changed

  const { error } = await admin
    .from("profiles")
    .update({ plan: args.plan, updated_at: new Date().toISOString() })
    .eq("id", profile.id);
  if (error) throw new Error(error.message);

  await admin.from("builder_events").insert({
    owner_id: profile.id,
    event_type: "plan_changed",
    metadata: { from: profile.plan, to: args.plan, stripe_event: args.stripeEvent },
  });
}
