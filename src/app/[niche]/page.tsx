import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CtaButton, MarketingPage } from "@/components/marketing";
import { NICHES, getNiche } from "@/content/niches";

// Programmatic-SEO niche landing pages. ONE template (shared with the homepage,
// see src/components/marketing.tsx), one page per entry in src/content/niches.ts.
// Statically generated at build (generateStaticParams) so Google sees fast, fully
// rendered HTML; dynamicParams=false means any slug not in the list 404s instead
// of rendering an empty shell. Static sibling routes (/pricing, /q, ...) take
// precedence over this dynamic segment.
//
// The only thing that differs from the homepage is the copy and the hero action:
// here the left side is a button into the wizard (the homepage); the homepage
// itself renders the wizard inline.
export const dynamicParams = false;

// utm_source=niche lets Generator.captureAttribution tag the signup as
// `niche_page`. The wizard lives on the homepage, so the niche CTA points there.
const CTA_HREF = "/?utm_source=niche";
const CTA_LABEL = "Build my quiz free";

export function generateStaticParams() {
  return NICHES.map((n) => ({ niche: n.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ niche: string }>;
}): Promise<Metadata> {
  const { niche } = await params;
  const data = getNiche(niche);
  if (!data) return {};
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    alternates: { canonical: `/${data.slug}` },
  };
}

export default async function NichePage({
  params,
}: {
  params: Promise<{ niche: string }>;
}) {
  const { niche } = await params;
  const data = getNiche(niche);
  if (!data) notFound();

  return (
    <MarketingPage
      content={data}
      ctaHref={CTA_HREF}
      heroAction={
        <>
          <CtaButton href={CTA_HREF} label={CTA_LABEL} />
          <p className="mt-3 text-xs font-medium text-fg-dim">No card to start.</p>
        </>
      }
    />
  );
}
