// One-time (idempotent) Stripe catalog setup: the Treeflow Pro product with
// monthly and yearly prices, addressable by lookup_key so re-running is safe
// and environments (test vs live) stay symmetric.
//
// Usage (key comes from the environment, never the command line):
//   set -a; source .env.local; set +a; node scripts/stripe-setup.mjs
//
// Prints STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_YEARLY lines ready for
// .env.local and Vercel.

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is not set. Source .env.local first.");
  process.exit(1);
}
const stripe = new Stripe(key);
const mode = key.startsWith("sk_live") ? "LIVE" : "test";

const PLANS = [
  { lookupKey: "ff_pro_monthly", amount: 3900, interval: "month" },
  { lookupKey: "ff_pro_yearly", amount: 39000, interval: "year" },
];

async function findOrCreateProduct() {
  // Products can't be looked up by key, so we tag ours with metadata.
  const existing = await stripe.products.search({
    query: "metadata['ff_product']:'pro' AND active:'true'",
  });
  if (existing.data[0]) return existing.data[0];
  return stripe.products.create({
    name: "Treeflow Pro",
    description: "Unlimited published quizzes, no branding, full analytics.",
    metadata: { ff_product: "pro" },
  });
}

async function findOrCreatePrice(productId, { lookupKey, amount, interval }) {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (existing.data[0]) return existing.data[0];
  return stripe.prices.create({
    product: productId,
    lookup_key: lookupKey,
    currency: "usd",
    unit_amount: amount,
    recurring: { interval },
  });
}

const product = await findOrCreateProduct();
console.error(`[stripe-setup] ${mode} mode · product ${product.id} (${product.name})`);

const envNames = {
  ff_pro_monthly: "STRIPE_PRICE_PRO_MONTHLY",
  ff_pro_yearly: "STRIPE_PRICE_PRO_YEARLY",
};
for (const plan of PLANS) {
  const price = await findOrCreatePrice(product.id, plan);
  console.error(
    `[stripe-setup] ${plan.lookupKey}: $${(plan.amount / 100).toFixed(0)}/${plan.interval} → ${price.id}`,
  );
  console.log(`${envNames[plan.lookupKey]}=${price.id}`);
}
