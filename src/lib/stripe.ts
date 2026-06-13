import "server-only";
import Stripe from "stripe";

// Lazy singleton: constructing Stripe at module load would crash builds/dev
// when the key isn't configured yet. Server-only — the secret key must never
// reach a client bundle.
let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!stripe) stripe = new Stripe(key);
  return stripe;
}

// Opt-in Pro trial, attached to the Stripe subscription itself: card collected
// at checkout, $0 today, charged automatically when the trial ends. First
// subscription per customer only — returning subscribers pay immediately.
export const TRIAL_DAYS = 14;

/**
 * Trial eligibility = this customer has never had a subscription (any status,
 * including canceled trials — canceling and re-subscribing doesn't reset it).
 * No customer id yet means they've never reached checkout: eligible.
 */
export async function isTrialEligible(customerId: string | null): Promise<boolean> {
  if (!customerId) return true;
  const subs = await getStripe().subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 1,
  });
  return subs.data.length === 0;
}

// Price IDs created by scripts/stripe-setup.mjs (lookup_keys ff_pro_monthly /
// ff_pro_yearly).
export function proPriceId(interval: "monthly" | "yearly"): string {
  const id =
    interval === "yearly"
      ? process.env.STRIPE_PRICE_PRO_YEARLY
      : process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (!id) throw new Error(`Stripe price id for ${interval} is not configured`);
  return id;
}
