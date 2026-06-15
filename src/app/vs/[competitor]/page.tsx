import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CtaButton } from "@/components/marketing";
import { HeroGlow } from "@/components/HeroGlow";
import { COMPARISONS, getComparison } from "@/content/comparisons";

// BOFU comparison landing pages (/vs/[competitor]). One static page per entry in
// src/content/comparisons.ts. Statically generated at build so Google sees fast,
// fully rendered HTML; dynamicParams=false means any slug not in the list 404s.
//
// These are marketing pages like /[niche], so they use the SAME dark design
// system (bg-canvas, text-fg, accent, surface-1, the mono eyebrow / heavy Geist
// heading style). MarketingPage is keyed to the Niche shape and would not fit a
// comparison layout, so this route renders its own dark page with the same
// tokens, reusing the exported CtaButton and HeroGlow. SiteHeader/Footer are not
// exported from marketing.tsx, so they are replicated here with matching tokens.
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ competitor: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ competitor: string }>;
}): Promise<Metadata> {
  const { competitor } = await params;
  const data = getComparison(competitor);
  if (!data) return {};
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    alternates: { canonical: `/vs/${data.slug}` },
  };
}

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ competitor: string }>;
}) {
  const { competitor } = await params;
  const data = getComparison(competitor);
  if (!data) notFound();

  const ctaHref = `/?utm_source=vs_${data.slug}`;

  return (
    <main className="bg-canvas text-fg">
      {/* --- Hero --- */}
      <section className="relative isolate overflow-hidden">
        <HeroGlow />
        <SiteHeader />
        <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-6 text-center sm:px-8 sm:pb-20 sm:pt-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            {data.eyebrow}
          </p>
          <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-extrabold leading-[1.05] tracking-[-0.035em] text-fg sm:text-5xl">
            {data.h1}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-fg-muted">
            {data.subhead}
          </p>
          <div className="mt-8">
            <CtaButton href={ctaHref} label="Build my quiz free" />
            <p className="mt-3 text-xs font-medium text-fg-dim">No card to start.</p>
          </div>
        </div>
      </section>

      {/* --- Comparison table --- */}
      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
        <h2 className="text-center text-3xl font-extrabold tracking-[-0.03em] text-fg sm:text-4xl">
          Treeflow vs {data.name}, side by side
        </h2>

        {/* Horizontal scroll on small screens keeps the 3 columns readable. */}
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th className="w-1/4 px-5 py-4 text-xs font-bold uppercase tracking-[0.1em] text-fg-dim">
                  Feature
                </th>
                <th className="w-[37.5%] rounded-t-2xl bg-accent/[0.08] px-5 py-4 text-sm font-extrabold text-fg ring-1 ring-inset ring-accent/20">
                  Treeflow
                </th>
                <th className="w-[37.5%] px-5 py-4 text-sm font-bold text-fg-muted">
                  {data.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => {
                const last = i === data.rows.length - 1;
                return (
                  <tr key={row.feature}>
                    <th
                      scope="row"
                      className="border-t border-white/[0.06] px-5 py-5 align-top text-[14px] font-semibold text-fg"
                    >
                      {row.feature}
                    </th>
                    <td
                      className={`bg-accent/[0.08] px-5 py-5 align-top text-[14px] leading-relaxed text-fg ring-1 ring-inset ring-accent/20 ${
                        last ? "rounded-b-2xl" : ""
                      }`}
                    >
                      <span className="flex gap-2.5">
                        <CheckMark />
                        <span>{row.treeflow}</span>
                      </span>
                    </td>
                    <td className="border-t border-white/[0.06] px-5 py-5 align-top text-[14px] leading-relaxed text-fg-muted">
                      {row.them}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-12 text-center">
          <CtaButton href={ctaHref} label="Build my quiz free" />
        </div>
      </section>

      {/* --- FAQ --- */}
      <section className="relative">
        <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
          <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-fg sm:text-4xl">
            Q&amp;A
          </h2>
          <div className="mt-10 space-y-4">
            {data.faqs.map((f) => (
              <div
                key={f.q}
                className="rounded-[22px] border border-white/[0.06] bg-surface-1 p-6 shadow-card-dark"
              >
                <h3 className="text-base font-bold text-fg">{f.q}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{f.a}</p>
              </div>
            ))}
          </div>

          {/* Indexable, keyword-bearing summary. Kept quiet and below the FAQ. */}
          <p className="mt-12 text-[13px] leading-relaxed text-fg-faint">{data.intro}</p>
        </div>
      </section>

      <Footer />
    </main>
  );
}

// --- Local chrome (matches marketing.tsx, which does not export these) -------

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

function CheckMark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="mt-0.5 h-4 w-4 shrink-0 text-accent-bright"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}
