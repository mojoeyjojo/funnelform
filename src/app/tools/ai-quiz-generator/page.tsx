import type { Metadata } from "next";
import FreeTool from "@/components/FreeTool";

// The free tool (build spec §5.10): the #1 acquisition surface + Claim 5's main
// instrument. Public, indexable, SEO-targeted. The interactive flow is the
// FreeTool client component.
export const metadata: Metadata = {
  title: "Free AI Quiz Generator — turn your website into a lead quiz | Treeflow",
  description:
    "Paste your URL and get a complete, publishable lead-generation quiz funnel in seconds. Questions, scored outcomes, and a follow-up sequence, written for your business. Free to try.",
  alternates: { canonical: "/tools/ai-quiz-generator" },
};

export default function FreeToolPage() {
  return <FreeTool />;
}
