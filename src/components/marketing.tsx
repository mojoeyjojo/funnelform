import Link from "next/link";
import Image from "next/image";
import { HeroGlow } from "@/components/HeroGlow";
import { SITE_STATS, type Niche, type Testimonial } from "@/content/niches";

// The ONE marketing template, shared by the homepage (`/`) and every niche
// landing page (`/[niche]`). Both render the exact same conversion structure
// (hero, proof strip, problem to solution, benefits-as-outcomes, testimonials,
// FAQ + final CTA) and differ only in copy and in the hero's left-side action:
// a niche page shows a button into the wizard (the homepage), the homepage shows
// the wizard itself. Everything is driven by a `Niche`-shaped content object.
//
// Visual system: dark theme (design-board-dark-v2). One fixed palette recurs in
// every section: near-black canvas, surface cards by value, a single #2546ff
// accent, four text steps. The product mocks deliberately stay LIGHT (they are
// little screenshots of the real, light product) and the testimonial cards sit
// on a light gradient, so the page has bright moments against the dark field.
//
// Server-compatible (no hooks): the route drops a client `heroAction` (the
// wizard) into the hero without this module needing to be a client component.

// --- Page shell -----------------------------------------------------------

export function MarketingPage({
  content,
  heroAction,
  ctaHref = "/",
}: {
  content: Niche;
  /** Rendered under the hero subhead on the left: a CTA button (niche) or the
   *  generator wizard (homepage). */
  heroAction: React.ReactNode;
  /** Where the closing CTA points. Niche → the homepage wizard; home → the hero
   *  wizard anchor. */
  ctaHref?: string;
}) {
  return (
    <main className="bg-canvas text-fg">
      <Hero content={content} heroAction={heroAction} />
      <ProblemSolution content={content} />
      <Benefits content={content} />
      <Testimonials content={content} />
      <FaqAndCta content={content} ctaHref={ctaHref} />
      <Footer />
    </main>
  );
}

// --- Shared chrome --------------------------------------------------------

function SiteHeader() {
  return (
    <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <Link href="/" className="text-lg font-extrabold tracking-tight text-fg">
        Treeflow
      </Link>
      <nav className="flex items-center gap-5 text-sm text-fg-muted">
        <Link href="/pricing" className="transition-colors hover:text-fg">
          Pricing
        </Link>
        <Link href="/login" className="transition-colors hover:text-fg">
          Sign in
        </Link>
      </nav>
    </header>
  );
}

export function CtaButton({
  href = "/",
  label,
  className = "",
}: {
  href?: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-block rounded-full bg-accent px-7 py-3.5 text-xs font-bold uppercase tracking-[0.1em] text-white transition-all hover:bg-accent-bright hover:shadow-accent active:scale-[0.98] ${className}`}
    >
      {label} →
    </Link>
  );
}

// --- Section 1: Hero ------------------------------------------------------
// The 5-second test. Headline, subtext, the left-side action, and the product
// visual. Split on lg; stacks (text first, then the phone) on mobile.

function Hero({ content, heroAction }: { content: Niche; heroAction: React.ReactNode }) {
  return (
    <section id="start" className="relative isolate overflow-hidden">
      {/* Accent radial wash on the near-black canvas, header included. */}
      <HeroGlow />
      <SiteHeader />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-12 pt-2 sm:px-8 sm:pb-16 sm:pt-6 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            {content.eyebrow}
          </p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-[-0.035em] text-fg sm:text-5xl">
            {content.h1}
          </h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-fg-muted">
            {content.subhead}
          </p>
          <div className="mt-8">{heroAction}</div>
        </div>

        {/* Visual: the actual product, the quiz on a phone (kept light). */}
        <div className="flex justify-center lg:justify-end">
          <PhoneFrame>
            <QuizScreen content={content} />
          </PhoneFrame>
        </div>
      </div>

      {/* Proof strip sits on the same glow, just below the hero. */}
      <ProofStrip />
    </section>
  );
}

// --- Section 2: Proof strip -----------------------------------------------

function ProofStrip() {
  const stats = SITE_STATS.filter((s) => s.value.trim());
  if (stats.length === 0) return null;
  return (
    <div className="relative">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-12 gap-y-5 px-5 py-7 pb-12 sm:px-8 sm:py-8 sm:pb-16">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-2xl font-extrabold tracking-[-0.02em] text-fg sm:text-3xl">
              {s.value}
            </p>
            <p className="mt-0.5 text-xs font-medium text-fg-dim">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Section 3: Problem to solution ---------------------------------------

const STEPS = [
  "Describe your business or paste your link.",
  "AI writes the whole funnel: questions, results, emails.",
  "Edit, brand it, and publish the link.",
];

function ProblemSolution({ content }: { content: Niche }) {
  return (
    <section className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-28">
      <p className="text-lg leading-relaxed text-fg-muted sm:text-xl">{content.pain}</p>
      <p className="mt-5 text-lg font-bold leading-relaxed tracking-[-0.01em] text-fg sm:text-xl">
        {content.resolution}
      </p>

      <ol className="mt-12 grid gap-5 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className="rounded-[22px] border border-white/[0.06] bg-surface-1 p-6 shadow-card-dark"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 font-mono text-sm font-bold text-accent-bright">
              {i + 1}
            </span>
            <p className="mt-4 text-[15px] font-semibold leading-relaxed text-fg">{s}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// --- Section 4: Benefits as outcomes, product shown working ---------------

const BENEFITS = [
  {
    outcome: "Qualify leads automatically",
    feature: "Scored results",
    body: "Every answer adds up to a recommended result, so you can see who is ready to book.",
    visual: "scored",
  },
  {
    outcome: "Capture leads with no website",
    feature: "A hosted quiz link",
    body: "Share one link in your bio or a QR code at the desk. No website, no setup screens.",
    visual: "phone",
  },
  {
    outcome: "Follow up without lifting a finger",
    feature: "A drafted email sequence",
    body: "A ready-to-send follow-up sequence is written for you, so no lead goes cold.",
    visual: "email",
  },
  {
    outcome: "Continue on WhatsApp in one tap",
    feature: "Click-to-chat handoff",
    body: "Send a hot lead straight into a WhatsApp chat to close the booking while they are warm.",
    visual: "whatsapp",
  },
] as const;

function Benefits({ content }: { content: Niche }) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* A single soft accent wash gives the flat dark section depth, the same
          accent that lights the hero, kept low and to one side. */}
      <div aria-hidden className="bg-section-glow pointer-events-none absolute inset-0 -z-10" />
      <div className="relative mx-auto max-w-6xl space-y-16 px-5 py-20 sm:px-8 sm:py-28 sm:space-y-24">
        {BENEFITS.map((b, i) => (
          <div key={b.outcome} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <div className={i % 2 === 1 ? "lg:order-2" : ""}>
              <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-fg sm:text-3xl">
                {b.outcome}
              </h2>
              <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                {b.feature}
              </p>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-fg-muted">{b.body}</p>
            </div>
            <div className={i % 2 === 1 ? "lg:order-1" : ""}>
              <BenefitVisual kind={b.visual} content={content} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- Section 5: Testimonials ----------------------------------------------

function Testimonials({ content }: { content: Niche }) {
  if (content.testimonials.length === 0) return null;
  // THREE copies of the list back-to-back. The marquee animates across the middle
  // copy (-33.33% to -66.66%), so the centered card always has real neighbors on
  // both sides and the loop is seamless (each copy looks identical).
  const loop = [...content.testimonials, ...content.testimonials, ...content.testimonials];
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 className="mx-auto max-w-2xl text-center text-3xl font-extrabold tracking-[-0.03em] text-fg sm:text-4xl">
          Join 1,200+ businesses turning visitors into booked clients
        </h2>

        {/* Stepped CSS marquee (slide, pause, slide): a card lands dead-center at
            every stop, neighbors peeking and fading out at both sides. The left
            padding `calc(50% - cardWidth/2)` centers the focused card, so it must
            track the card width (450 / 510). Pauses on hover. */}
        <div className="mask-fade-x mt-10 overflow-hidden py-6 pl-[calc(50%_-_225px)] sm:pl-[calc(50%_-_255px)]">
          <div className="animate-marquee flex w-max items-stretch hover:[animation-play-state:paused]">
            {loop.map((t, i) => (
              <TestimonialCard key={i} t={t} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// Light-gradient card: a bright moment against the dark page, with the original
// ink text it was designed for.
function TestimonialCard({ t }: { t: Testimonial }) {
  return (
    <figure className="mr-6 flex w-[450px] shrink-0 flex-col rounded-[26px] bg-gradient-to-b from-white to-paper px-8 py-6 shadow-[0_18px_40px_-22px_rgba(0,0,0,0.8)] ring-1 ring-black/5 sm:w-[510px]">
      <blockquote className="flex-1 text-lg leading-relaxed text-ink-800">
        &ldquo;{t.result}&rdquo;
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-4">
        {t.avatar ? (
          <Image
            src={t.avatar}
            alt={t.name}
            width={60}
            height={60}
            loading="eager"
            className="h-15 w-15 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-15 w-15 shrink-0 items-center justify-center rounded-full bg-accent/10 text-base font-bold text-accent">
            {initials(t.name)}
          </span>
        )}
        <span>
          <span className="block text-[15px] font-bold text-ink-950">{t.name}</span>
          <span className="block text-sm text-ink-500">{t.role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

// --- Section 6: FAQ + final CTA -------------------------------------------

function FaqAndCta({ content, ctaHref }: { content: Niche; ctaHref: string }) {
  return (
    <section className="relative">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8 sm:py-28">
        <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-fg sm:text-4xl">Q&A</h2>
        <div className="mt-10 space-y-4">
          {content.faqs.map((f) => (
            <div
              key={f.q}
              className="rounded-[22px] border border-white/[0.06] bg-surface-1 p-6 shadow-card-dark"
            >
              <h3 className="text-base font-bold text-fg">{f.q}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{f.a}</p>
            </div>
          ))}
        </div>

        {/* Final CTA: restate the promise, repeat the action, no competing links.
            The deep accent-glow moment from the design board. */}
        <div className="bg-cta-glow mt-16 overflow-hidden rounded-[28px] border border-white/[0.06] px-8 py-14 text-center shadow-card-dark sm:px-12">
          <h2 className="mx-auto max-w-xl text-2xl font-extrabold tracking-[-0.03em] text-fg sm:text-3xl">
            Start with a finished funnel, not a blank page.
          </h2>
          <div className="mt-8">
            <CtaButton
              href={ctaHref}
              label="Build my quiz free"
              className="!bg-white !text-canvas hover:!bg-white/90 hover:!shadow-none"
            />
            <p className="mt-3 text-xs font-medium text-fg-muted">No card to start.</p>
          </div>
        </div>

        {/* Indexable, keyword-bearing summary. Kept quiet and below the CTA. */}
        <p className="mt-12 text-[13px] leading-relaxed text-fg-faint">{content.intro}</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row sm:px-8">
        <span className="text-lg font-extrabold tracking-tight text-fg">Treeflow</span>
        <nav className="flex items-center gap-6 text-sm text-fg-muted">
          <Link href="/pricing" className="transition-colors hover:text-fg">
            Pricing
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-fg">
            Privacy
          </Link>
          <Link href="/login" className="transition-colors hover:text-fg">
            Sign in
          </Link>
          <a href="mailto:emails@odune.nl" className="transition-colors hover:text-fg">
            Contact
          </a>
        </nav>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-faint">
          © 2026 Treeflow
        </span>
      </div>
    </footer>
  );
}

// --- Product visuals (kept LIGHT) -----------------------------------------
// Static, on-brand mocks of the real product. Not interactive; they exist to
// make the claims concrete. They stay light because they are little screenshots
// of the actual (light) product, which reads as authentic against the dark page.

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[300px] rounded-[2.25rem] bg-ink-950 p-2.5 shadow-float">
      <div className="overflow-hidden rounded-[1.75rem] bg-white">{children}</div>
    </div>
  );
}

function QuizScreen({ content }: { content: Niche }) {
  const q1 = content.exampleQuiz.questions[0];
  return (
    <div className="px-5 py-6">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-600">
        {content.exampleQuiz.title}
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-100">
        <div className="h-full w-1/3 rounded-full bg-signal-600" />
      </div>
      <h3 className="mt-4 text-base font-bold leading-snug tracking-[-0.01em] text-ink-950">
        {q1?.text}
      </h3>
      <div className="mt-3 space-y-2">
        {q1?.options.map((o, i) => (
          <div
            key={o}
            className={
              i === 0
                ? "rounded-xl border border-signal-600 bg-signal-600/[0.06] px-3 py-2.5 text-[13px] font-medium text-ink-950"
                : "rounded-xl border border-ink-200/80 px-3 py-2.5 text-[13px] font-medium text-ink-700"
            }
          >
            {o}
          </div>
        ))}
      </div>
    </div>
  );
}

function BenefitVisual({ kind, content }: { kind: string; content: Niche }) {
  switch (kind) {
    case "scored":
      return <ScoredResultMock content={content} />;
    case "phone":
      return <BioLinkMock />;
    case "email":
      return <EmailSequenceMock />;
    case "whatsapp":
      return <WhatsAppMock />;
    default:
      return null;
  }
}

function ScoredResultMock({ content }: { content: Niche }) {
  const top = content.exampleQuiz.outcomes[0];
  return (
    <div className="mx-auto w-full max-w-sm rounded-[22px] surface-card p-6">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
        Their result
      </p>
      <p className="mt-2 text-lg font-extrabold text-ink-950">{top?.name}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{top?.description}</p>
      <div className="mt-5 rounded-2xl bg-ink-50 p-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-signal-600">
          New lead captured
        </p>
        <div className="mt-2 flex items-center justify-between text-[13px]">
          <span className="font-semibold text-ink-900">Maya R.</span>
          <span className="text-ink-500">maya@email.com</span>
        </div>
        <p className="mt-1 text-[12px] text-ink-500">Matched: {top?.name}</p>
      </div>
    </div>
  );
}

function BioLinkMock() {
  return (
    <PhoneFrame>
      <div className="px-5 py-6">
        <div className="flex items-center gap-3">
          <span className="h-12 w-12 rounded-full bg-gradient-to-br from-signal-600 to-ink-300" />
          <div>
            <p className="text-sm font-bold text-ink-950">@yourspa</p>
            <p className="text-[12px] text-ink-500">Glow starts here ✨</p>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-signal-600 bg-signal-600/[0.06] px-4 py-3 text-center text-[13px] font-bold text-signal-700">
          Take the skin quiz →
        </div>
        <div className="mt-2 rounded-xl border border-ink-200/80 px-4 py-3 text-center text-[13px] font-medium text-ink-600">
          Book an appointment
        </div>
      </div>
    </PhoneFrame>
  );
}

function EmailSequenceMock() {
  const rows = [
    { t: "+0h", s: "Your result is in, here is what we recommend" },
    { t: "+48h", s: "A few before-and-afters from clients like you" },
    { t: "+120h", s: "Ready to book? Here is 10% off your first visit" },
  ];
  return (
    <div className="mx-auto w-full max-w-sm space-y-3 rounded-[22px] surface-card p-6">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
        Follow-up sequence
      </p>
      {rows.map((r) => (
        <div key={r.t} className="rounded-2xl border border-dashed border-ink-200 p-3">
          <p className="font-mono text-[10px] text-ink-400">{r.t}</p>
          <p className="mt-1 text-[13px] font-semibold text-ink-900">{r.s}</p>
        </div>
      ))}
    </div>
  );
}

function WhatsAppMock() {
  return (
    <div className="mx-auto w-full max-w-sm rounded-[22px] surface-card p-6">
      <div className="space-y-2">
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-[#dcf8c6] px-4 py-2.5 text-[13px] text-ink-900">
          Hi! I just took your skin quiz, my result was Injectable Refresh.
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-ink-100 px-4 py-2.5 text-[13px] text-ink-800">
          Perfect, I can get you booked this week. What days work?
        </div>
      </div>
      <div className="mt-5 flex items-center justify-center gap-2 rounded-full bg-[#25d366] px-5 py-3 text-[13px] font-bold text-white">
        Chat on WhatsApp
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
