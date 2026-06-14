"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// The marketing page that grows downward from the live generator hero on `/`
// (design-pass §2.1). Renders only in the idle (entry) state, never once the
// generate flow starts, and never in the in-app builder. Twilight treatment per
// STYLE.md with scroll reveals (§7), all motion behind prefers-reduced-motion.

// Scroll reveal (STYLE.md §7): IntersectionObserver fires once at 0.2 threshold,
// then disconnects. translate-y-6 opacity-0 -> translate-y-0 opacity-100 over
// 600ms, with an optional stagger. Reduced motion shows content immediately.
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // Reveal immediately for reduced-motion users. Done post-mount (not a lazy
      // initializer) because matchMedia is client-only and SSR must not diverge.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-[600ms] ease-out motion-reduce:transition-none ${
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-signal-600">
      {children}
    </p>
  );
}

const STEPS = [
  {
    n: "1",
    title: "Paste your link",
    body: "Drop in your website, or just describe your business. No blank page, no setup screens.",
  },
  {
    n: "2",
    title: "Watch it build",
    body: "The AI writes the questions, scores the outcomes, and drafts a follow-up email sequence in seconds.",
  },
  {
    n: "3",
    title: "Publish and share",
    body: "Get a link for your Instagram bio, WhatsApp, or email. Leads land straight in your workspace.",
  },
];

const FEATURES = [
  {
    title: "Smart questions",
    body: "Five to seven questions tuned to your offer, one per screen so people actually finish.",
  },
  {
    title: "Scored outcomes",
    body: "Every answer maps to a result with a recommendation and a clear next step for the visitor.",
  },
  {
    title: "Follow-up sequence",
    body: "A three-email drip drafted for you, ready to paste into your email tool.",
  },
];

const FAQS = [
  {
    q: "Do I need a website?",
    a: "No. Paste a link if you have one, or just describe your business and we will take it from there.",
  },
  {
    q: "How do leads reach me?",
    a: "Every lead lands in your workspace and we email you the moment one comes in. You can export them as a CSV anytime.",
  },
  {
    q: "Can I edit what the AI makes?",
    a: "Yes. Change any wording, set your brand color, and choose where each result's button sends people.",
  },
  {
    q: "What does it cost?",
    a: "Your first quiz is free. Pro is $39 a month for unlimited quizzes, no watermark, and full analytics.",
  },
];

export default function MarketingBody() {
  return (
    <div className="relative bg-white">
      {/* How it works */}
      <section className="mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
        <Reveal className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-ink-950 sm:text-4xl">
            From your link to a live funnel in three steps
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 80}>
              <div className="h-full rounded-[22px] bg-white p-6 shadow-soft ring-1 ring-ink-950/5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-signal-600/10 font-mono text-sm font-bold text-signal-600">
                  {s.n}
                </span>
                <h3 className="mt-4 text-lg font-bold tracking-[-0.01em] text-ink-950">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* What you get */}
      <section className="bg-ink-50/50">
        <div className="mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
          <Reveal className="max-w-2xl">
            <Eyebrow>What you get</Eyebrow>
            <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-ink-950 sm:text-4xl">
              A complete funnel, not just a quiz
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 80}>
                <div className="h-full rounded-[22px] bg-white p-6 shadow-soft ring-1 ring-ink-950/5">
                  <h3 className="text-lg font-bold tracking-[-0.01em] text-ink-950">{f.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* What your visitors see — player teaser */}
      <section className="mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid items-center gap-10 sm:grid-cols-2">
          <Reveal>
            <Eyebrow>What your visitors see</Eyebrow>
            <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-ink-950 sm:text-4xl">
              A clean quiz that works on every phone
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-600">
              One question per screen, a clear sense of progress, and your brand color throughout.
              Built mobile-first, because that is where most of your traffic comes from.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <PlayerPreview />
          </Reveal>
        </div>
      </section>

      {/* Pricing teaser — the one twilight accent band */}
      <section className="mx-auto max-w-5xl px-5 pb-20 sm:px-8 sm:pb-28">
        <Reveal>
          <div className="overflow-hidden rounded-[28px] bg-ink-950 px-8 py-14 text-center shadow-float sm:px-12">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mx-auto mt-3 max-w-xl text-3xl font-extrabold tracking-[-0.03em] text-white sm:text-4xl">
              Start free. Upgrade when it is working.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-ink-300">
              Build and publish your first quiz on the free plan. Go Pro for unlimited quizzes, your
              own branding, full analytics, and WhatsApp delivery.
            </p>
            <Link
              href="/pricing"
              className="mt-8 inline-block rounded-full bg-white px-7 py-3.5 text-xs font-bold uppercase tracking-[0.1em] text-ink-950 transition-all hover:bg-signal-600 hover:text-white active:scale-[0.98]"
            >
              See pricing →
            </Link>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 pb-20 sm:px-8 sm:pb-28">
        <Reveal>
          <Eyebrow>Questions</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-ink-950 sm:text-4xl">
            Good to know
          </h2>
        </Reveal>
        <div className="mt-10 space-y-4">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 60}>
              <div className="rounded-[22px] bg-white p-6 shadow-soft ring-1 ring-ink-950/5">
                <h3 className="text-base font-bold text-ink-950">{f.q}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-600">{f.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--hairline)]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row sm:px-8">
          <span className="text-lg font-extrabold tracking-tight text-ink-950">Funnelform</span>
          <nav className="flex items-center gap-6 text-sm text-ink-600">
            <Link href="/pricing" className="transition-colors hover:text-signal-600">
              Pricing
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-signal-600">
              Privacy
            </Link>
            <Link href="/login" className="transition-colors hover:text-signal-600">
              Sign in
            </Link>
            <a href="mailto:emails@odune.nl" className="transition-colors hover:text-signal-600">
              Contact
            </a>
          </nav>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-400">
            © 2026 Funnelform
          </span>
        </div>
      </footer>
    </div>
  );
}

// A static, on-brand mock of the published player (not interactive) so visitors
// can see the experience without a live demo slug to maintain.
function PlayerPreview() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-[22px] bg-white p-6 shadow-float ring-1 ring-ink-950/5">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink-700">
        Question 2 of 6
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-100">
        <div className="h-full w-1/3 rounded-full bg-signal-600" />
      </div>
      <h3 className="mt-5 text-lg font-bold leading-snug tracking-[-0.01em] text-ink-950">
        What is your biggest goal right now?
      </h3>
      <div className="mt-4 space-y-2.5">
        <div className="rounded-2xl border border-signal-600 bg-signal-600/[0.06] px-4 py-3 text-sm font-medium text-ink-950">
          More booked calls
        </div>
        <div className="rounded-2xl border border-ink-200/80 px-4 py-3 text-sm font-medium text-ink-700">
          A bigger email list
        </div>
        <div className="rounded-2xl border border-ink-200/80 px-4 py-3 text-sm font-medium text-ink-700">
          Better-qualified leads
        </div>
      </div>
    </div>
  );
}
