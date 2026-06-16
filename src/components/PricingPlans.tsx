"use client";

import { useState } from "react";
import Link from "next/link";
import type { Plan } from "@/lib/plan";

// Pricing cards with a Monthly/Yearly billing toggle. Only Pro has billing
// intervals, so the toggle drives the Pro price + checkout interval; Free and
// Growth are interval-agnostic. Yearly is the default selection on load.

type Billing = "monthly" | "yearly";

const MONTHLY = 39;
const YEARLY = 390;
const MONTHLY_EQUIV = (YEARLY / 12).toFixed(2); // 32.50
const YEARLY_SAVING = MONTHLY * 12 - YEARLY; // 78
const YEARLY_PERCENT = Math.round((YEARLY_SAVING / (MONTHLY * 12)) * 100); // 17

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

export default function PricingPlans({
  plan,
  isPaid,
  trialEligible,
  trialDays,
}: {
  plan: Plan | null;
  isPaid: boolean;
  trialEligible: boolean;
  trialDays: number;
}) {
  const [billing, setBilling] = useState<Billing>("yearly");

  return (
    <>
      {/* Billing toggle */}
      <div className="mb-10 flex justify-center">
        <div
          role="radiogroup"
          aria-label="Billing interval"
          className="inline-flex rounded-full border border-[var(--hairline)] bg-white/60 p-1 text-xs font-bold uppercase tracking-[0.1em]"
        >
          {(
            [
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: `Yearly · save ${YEARLY_PERCENT}%` },
            ] as { value: Billing; label: string }[]
          ).map((opt) => {
            const active = billing === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setBilling(opt.value)}
                className={`rounded-full px-4 py-2 transition-colors ${
                  active ? "bg-ink-950 text-white" : "text-ink-500 hover:text-ink-800"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

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
          {billing === "yearly" ? (
            <>
              <p className="mt-1 text-3xl font-extrabold tracking-tight">
                ${MONTHLY_EQUIV}<span className="text-sm font-semibold text-ink-500"> /month</span>
              </p>
              <p className="mt-1 text-xs text-ink-500">
                billed annually at ${YEARLY} · save ${YEARLY_SAVING}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-3xl font-extrabold tracking-tight">
                ${MONTHLY}<span className="text-sm font-semibold text-ink-500"> /month</span>
              </p>
              <p className="mt-1 text-xs text-ink-500">billed monthly</p>
            </>
          )}
          <ul className="mt-5 space-y-2.5">
            <Feature>Everything in Free</Feature>
            <Feature>Unlimited published quizzes</Feature>
            <Feature>Remove Treeflow branding</Feature>
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
                  <input type="hidden" name="interval" value={billing} />
                  <button
                    type="submit"
                    className="w-full rounded-full bg-ink-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition-all hover:bg-signal-600 active:scale-[0.98]"
                  >
                    {trialEligible
                      ? `Try Pro free for ${trialDays} days`
                      : billing === "yearly"
                        ? `Upgrade · $${YEARLY}/yr`
                        : `Upgrade · $${MONTHLY}/mo`}
                  </button>
                </form>
                {trialEligible && (
                  <p className="text-center text-xs text-ink-500">
                    Card required, $0 today. Your plan starts at{" "}
                    {billing === "yearly" ? `$${YEARLY}/yr` : `$${MONTHLY}/mo`} after the trial.
                    Cancel anytime before then and pay nothing.
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
              href="mailto:emails@odune.nl?subject=Treeflow%20Growth"
              className="block rounded-full border border-[var(--hairline)] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
            >
              Contact us
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
