import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePlan, fetchPlanProfile, type Plan } from "@/lib/plan";
import { isTrialEligible, TRIAL_DAYS } from "@/lib/stripe";
import PricingPlans from "@/components/PricingPlans";

export const runtime = "nodejs";

// Pricing (build spec §5.9): Free + Pro are real, Growth is a teaser tier
// ("Contact us") that anchors Pro's price. The plan cards and the Monthly/Yearly
// billing toggle live in the PricingPlans client component; this page resolves
// the signed-in plan state and trial eligibility and passes them in. Checkout and
// billing management are plain form POSTs to the Stripe routes; signed-out
// visitors who click upgrade get bounced through login by the checkout route.

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; error?: string }>;
}) {
  const { canceled, error } = await searchParams;

  // Plan context for the signed-in state of the Pro card. Trial eligibility:
  // visitors and never-subscribed accounts get the trial pitch; anyone who has
  // ever held a subscription checks out without one.
  const user = await getCurrentUser();
  let plan: Plan | null = null;
  let trialEligible = true;
  if (user && !user.is_anonymous) {
    const supabase = await createSupabaseServerClient();
    const profile = await fetchPlanProfile(supabase, user.id);
    plan = effectivePlan(profile);
    if (profile?.stripe_customer_id) {
      trialEligible = await isTrialEligible(profile.stripe_customer_id).catch(() => false);
    }
  }
  const isPaid = plan === "pro" || plan === "growth";

  return (
    <main className="bg-dreamy min-h-screen px-5 py-16 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 text-center">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
            Treeflow · pricing
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.02em]">
            Simple plans, no surprises
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Start free. Upgrade when your quiz starts pulling its weight.
          </p>
        </header>

        {canceled === "1" && (
          <p className="mx-auto mb-6 max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-3 text-center text-sm text-amber-800">
            Checkout canceled. No charge was made.
          </p>
        )}
        {error === "1" && (
          <p className="mx-auto mb-6 max-w-md rounded-2xl border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-700">
            Something went wrong starting checkout. Please try again.
          </p>
        )}

        <PricingPlans
          plan={plan}
          isPaid={isPaid}
          trialEligible={trialEligible}
          trialDays={TRIAL_DAYS}
        />

        <p className="mt-8 text-center text-xs text-ink-500">
          Cancel anytime from your billing portal. Lead limits are soft: we never drop a lead.
        </p>
      </div>
    </main>
  );
}
