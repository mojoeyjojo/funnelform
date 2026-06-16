// Idempotent promotional-code setup: a percent-off coupon plus a customer-facing
// promotion code that maps to it. Safe to re-run (it finds an existing coupon by
// its deterministic id and an existing promotion code by its string).
//
// Usage (key and values come from the environment, never the command line history
// when you can avoid it):
//   CODE=LAUNCH95 PERCENT=95 MAX=50 STRIPE_SECRET_KEY=rk_live_xxx node scripts/stripe-coupon.mjs
//
// Defaults: CODE=LAUNCH95, PERCENT=95, MAX=50, DURATION=once.
// The coupon applies to whatever price the customer picks (monthly or yearly),
// since percent-off is price-agnostic. DURATION=once means the discount hits the
// first invoice only. Note: with the card-upfront 14-day trial, the discount lands
// on the first real charge after the trial ends, not on the $0 trial invoice.

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set.");
  process.exit(1);
}
const stripe = new Stripe(key);
// Mode is decided by the key prefix. Both secret (sk_) and restricted (rk_) keys
// carry _live_ or _test_, so match the substring.
const mode = key.includes("_live_") ? "LIVE" : "test";

const code = (process.env.CODE ?? "LAUNCH95").toUpperCase();
const percent = Number(process.env.PERCENT ?? "95");
const maxRedemptions = Number(process.env.MAX ?? "50");
const duration = process.env.DURATION ?? "once";

if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
  console.error(`PERCENT must be between 1 and 100 (got ${process.env.PERCENT}).`);
  process.exit(1);
}
if (!Number.isInteger(maxRedemptions) || maxRedemptions < 1) {
  console.error(`MAX must be a positive integer (got ${process.env.MAX}).`);
  process.exit(1);
}

// Deterministic coupon id so re-runs find-or-create rather than duplicate.
const couponId = `treeflow_${percent}off_${duration}`;

async function findOrCreateCoupon() {
  try {
    return await stripe.coupons.retrieve(couponId);
  } catch (err) {
    if (err?.code !== "resource_missing") throw err;
    return stripe.coupons.create({
      id: couponId,
      percent_off: percent,
      duration,
      name: `${percent}% off (${duration})`,
      metadata: { ff_coupon: "promo" },
    });
  }
}

async function findOrCreatePromotionCode(couponId) {
  const existing = await stripe.promotionCodes.list({ code, limit: 1 });
  if (existing.data[0]) return existing.data[0];
  // API 2026-05-27.dahlia: the coupon is referenced via the `promotion` object,
  // not a top-level `coupon` param.
  return stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: couponId },
    code,
    max_redemptions: maxRedemptions,
  });
}

const coupon = await findOrCreateCoupon();
console.error(`[stripe-coupon] ${mode} mode · coupon ${coupon.id} (${coupon.percent_off}% off, ${coupon.duration})`);

const promo = await findOrCreatePromotionCode(coupon.id);
console.error(
  `[stripe-coupon] promotion code "${promo.code}" → ${promo.id} (active: ${promo.active}, max redemptions: ${promo.max_redemptions ?? "unlimited"}, used: ${promo.times_redeemed})`,
);
console.log(`PROMO_CODE=${promo.code}`);
