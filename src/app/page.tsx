import Generator from "@/components/Generator";
import { MarketingPage } from "@/components/marketing";
import { LANDING } from "@/content/landing";

// The homepage. Same conversion structure as the niche landing pages (one shared
// template, see src/components/marketing.tsx); the only difference is the hero's
// left-side action. On a niche page that is a button into the wizard; here it IS
// the wizard, embedded inline. Submitting it runs the real generate pipeline and
// opens the new quiz in the editor, exactly as before. The closing CTA scrolls
// back up to the hero (`#start`).
export default function Home() {
  return (
    <MarketingPage
      content={LANDING}
      ctaHref="#start"
      heroAction={<Generator layout="hero" />}
    />
  );
}
