import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { effectivePlan, fetchPlanProfile, type Plan } from "@/lib/plan";
import { isTrialEligible, TRIAL_DAYS } from "@/lib/stripe";

export const runtime = "nodejs";

// Pricing (build spec §5.9): Free + Pro are real, Growth is a teaser tier
// ("Contact us") that anchors Pro's price. Checkout and billing management are
// plain form POSTs to the Stripe routes; signed-out visitors who click upgrade
// get bounced through login by the checkout route itself.

const CHECK = (
  <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-signal-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5l3.5 3.5L13 4.5" />
  </svg>
);

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm text-ink-600">
      {CHECK}
      <span>{children}</span>
    </li>
  );
}

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
            Funnelform · pricing
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

        <div className="grid gap-5 md:grid-cols-3">
          {/* Free */}
          <section className="glass-strong flex flex-col rounded-[22px] p-7">
            <h2 className="text-lg font-extrabold">Free</h2>
            <p className="mt-1 text-3xl font-extrabold tracking-tight">
              $0<span className="text-sm font-semibold text-ink-500"> /forever</span>
            </p>
            <p className="mt-2 text-sm text-ink-500">Everything you need to launch your first quiz funnel.</p>
            <ul className="mt-5 space-y-2.5">
              <Feature>AI quiz generation</Feature>
              <Feature>1 published quiz</Feature>
              <Feature>Lead capture + email notifications</Feature>
              <Feature>Basic stats: views, starts, completions</Feature>
              <Feature>Around 100 leads per month</Feature>
            </ul>
            <div className="mt-auto pt-6">
              {plan === "free" ? (
                <div
                  aria-disabled
                  className="rounded-full border border-[var(--hairline)] bg-ink-100/70 px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] text-ink-400"
                >
                  Current plan
                </div>
              ) : (
                <Link
                  href="/"
                  className="block rounded-full border border-[var(--hairline)] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
                >
                  Start free
                </Link>
              )}
            </div>
          </section>

          {/* Pro */}
          <section className="glass-strong relative flex flex-col rounded-[22px] p-7 ring-2 ring-signal-600">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-signal-600 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white">
              {isPaid ? "Current plan" : "Most popular"}
            </span>
            <h2 className="text-lg font-extrabold">Pro</h2>
            <p className="mt-1 text-3xl font-extrabold tracking-tight">
              $39<span className="text-sm font-semibold text-ink-500"> /month</span>
            </p>
            <p className="mt-1 text-xs text-ink-500">or $390 per year (two months free)</p>
            <ul className="mt-5 space-y-2.5">
              <Feature>Everything in Free</Feature>
              <Feature>Unlimited published quizzes</Feature>
              <Feature>Remove Funnelform branding</Feature>
              <Feature>Full analytics: drop-off by question, outcome breakdown</Feature>
              <Feature>Around 1,000 leads per month</Feature>
            </ul>
            <div className="mt-auto space-y-2 pt-6">
              {isPaid ? (
                <form action="/api/stripe/portal" method="post">
                  <button
                    type="submit"
                    className="w-full rounded-full bg-ink-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition-all hover:bg-signal-600 active:scale-[0.98]"
                  >
                    Manage billing
                  </button>
                </form>
              ) : (
                <>
                  <form action="/api/stripe/checkout" method="post">
                    <input type="hidden" name="interval" value="monthly" />
                    <button
                      type="submit"
                      className="w-full rounded-full bg-ink-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition-all hover:bg-signal-600 active:scale-[0.98]"
                    >
                      {trialEligible ? `Try Pro free for ${TRIAL_DAYS} days` : "Upgrade · $39/mo"}
                    </button>
                  </form>
                  <form action="/api/stripe/checkout" method="post">
                    <input type="hidden" name="interval" value="yearly" />
                    <button
                      type="submit"
                      className="w-full rounded-full border border-[var(--hairline)] px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
                    >
                      Go yearly · $390/yr
                    </button>
                  </form>
                  {trialEligible && (
                    <p className="text-center text-xs text-ink-500">
                      Card required, $0 today. Your plan starts at $39/mo (or $390/yr) after the
                      trial. Cancel anytime before then and pay nothing.
                    </p>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Growth */}
          <section className="glass-strong flex flex-col rounded-[22px] p-7">
            <h2 className="text-lg font-extrabold">Growth</h2>
            <p className="mt-1 text-3xl font-extrabold tracking-tight">
              $89<span className="text-sm font-semibold text-ink-500"> /month</span>
            </p>
            <p className="mt-2 text-sm text-ink-500">For teams running quizzes across several brands.</p>
            <ul className="mt-5 space-y-2.5">
              <Feature>Everything in Pro</Feature>
              <Feature>Multiple workspaces</Feature>
              <Feature>Priority support</Feature>
              <Feature>Hands-on funnel reviews</Feature>
            </ul>
            <div className="mt-auto pt-6">
              <a
                href="mailto:emails@odune.nl?subject=Funnelform%20Growth"
                className="block rounded-full border border-[var(--hairline)] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
              >
                Contact us
              </a>
            </div>
          </section>
        </div>

        <p className="mt-8 text-center text-xs text-ink-500">
          Cancel anytime from your billing portal. Lead limits are soft: we never drop a lead.
        </p>
      </div>
    </main>
  );
}
