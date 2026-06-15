// BOFU comparison landing pages (one per competitor keyword). Same idea as
// src/content/niches.ts: each entry is the ONLY thing that differs between
// pages. The route template in `src/app/vs/[competitor]` reads this data and
// renders a static page per slug. Adding a competitor = appending one object.
//
// COPY RULES (kept accuracy-safe so no human fact-check is needed):
//  - Lead with Treeflow's category difference: most quiz tools hand you a blank
//    builder; Treeflow writes the whole funnel (questions, scored outcomes,
//    follow-up emails) from your link in seconds.
//  - Competitor claims stay GENERAL and category-level. No specific prices, plan
//    names, or precise feature assertions that could be false or go stale. The
//    `them` column is framed as the general category norm, not as a verified fact
//    about that company's current product. Honest, defensible positioning only.
//  - No em dashes anywhere (project rule).

export type ComparisonRow = {
  /** What is being compared, e.g. "Building the quiz". */
  feature: string;
  /** Treeflow's side. Favored, written as a benefit. */
  treeflow: string;
  /** The competitor's side. The general category norm, kept neutral. */
  them: string;
};

export type ComparisonFaq = {
  q: string;
  a: string;
};

export type Comparison = {
  /** URL segment, e.g. "outgrow" -> /vs/outgrow. Lowercase, hyphenated. */
  slug: string;
  /** Competitor display name, e.g. "Outgrow". */
  name: string;
  /** <title> tag, ~55 chars. "Treeflow vs {name} | ...". */
  metaTitle: string;
  /** Meta description, ~150 chars. Drives click-through. */
  metaDescription: string;

  /** Mono eyebrow above the headline, e.g. "Treeflow vs Outgrow". */
  eyebrow: string;
  /** Headline. */
  h1: string;
  /** One or two lines under the headline. */
  subhead: string;

  /** The comparison table, 5-7 rows. */
  rows: ComparisonRow[];
  /** 3-4 FAQs. Doubles as SEO content. */
  faqs: ComparisonFaq[];

  /** Indexable body paragraph using the keyword naturally. Rendered small near
   *  the footer for SEO without cluttering the conversion flow. */
  intro: string;
};

// Rows shared by every comparison: the category-level difference is the same no
// matter who the competitor is, so the table reads consistently. Each entry can
// still tweak copy via its own `rows` if needed; here they all share this set.
const SHARED_ROWS: ComparisonRow[] = [
  {
    feature: "Building the quiz",
    treeflow:
      "AI writes the whole funnel from your link in seconds, you just edit",
    them: "Manual builder, you write every question yourself",
  },
  {
    feature: "Starting point",
    treeflow: "A finished, ready-to-edit funnel on the first screen",
    them: "Templates to pick from, but you start from a blank quiz",
  },
  {
    feature: "Scored outcomes",
    treeflow: "Results and the logic that picks them are drafted for you",
    them: "You set up the scoring and map answers to results by hand",
  },
  {
    feature: "Follow-up emails",
    treeflow: "A follow-up email sequence is written with the quiz",
    them: "Usually a separate tool or integration you wire up yourself",
  },
  {
    feature: "Time to first publish",
    treeflow: "Minutes, because the draft already exists",
    them: "Hours, building question by question from scratch",
  },
  {
    feature: "Free to start",
    treeflow: "Build and publish a real, working quiz on the free plan",
    them: "Free tiers are common, but limits vary by plan",
  },
];

export const COMPARISONS: Comparison[] = [
  {
    slug: "outgrow",
    name: "Outgrow",
    metaTitle: "Treeflow vs Outgrow | AI-Built Quiz Funnels",
    metaDescription:
      "Outgrow gives you a builder to fill in. Treeflow writes the whole quiz funnel, questions, scored results and follow-up emails, from your link in seconds.",
    eyebrow: "Treeflow vs Outgrow",
    h1: "The Outgrow alternative that builds the funnel for you",
    subhead:
      "Most quiz tools, Outgrow included, hand you a builder and a blank quiz. Treeflow writes the questions, scored results, and follow-up emails from your link in seconds. You just edit and publish.",
    rows: SHARED_ROWS,
    faqs: [
      {
        q: "How is Treeflow different from Outgrow?",
        a: "Outgrow is a builder you fill in question by question. Treeflow drafts the entire funnel for you from a link or a sentence, so you start with a finished quiz instead of a blank one.",
      },
      {
        q: "Can I still edit everything Treeflow writes?",
        a: "Yes. The AI draft is a starting point. You can rewrite any question, result, or email and set your brand color before you publish.",
      },
      {
        q: "Do I need a website to use Treeflow?",
        a: "No. Every quiz gets a hosted link you can share in a bio or as a QR code, no website or setup needed.",
      },
      {
        q: "Is there a free plan?",
        a: "Yes. You can build and publish a real, working quiz on the free plan before deciding to upgrade.",
      },
    ],
    intro:
      "Outgrow is a well-known interactive content platform for quizzes, calculators, and assessments, and people often look for an Outgrow alternative when the building takes longer than expected. The category norm is the same across these tools: you get a builder and a blank quiz, then write every question, set up the scoring, and wire up follow-up yourself. Treeflow takes a different approach by writing the whole funnel, questions, scored outcomes, and a follow-up email sequence, from your link in seconds, so you can launch in minutes and spend your time editing rather than building.",
  },
  {
    slug: "typeform",
    name: "Typeform",
    metaTitle: "Treeflow vs Typeform | AI Quiz Funnel Builder",
    metaDescription:
      "Typeform makes beautiful forms you build yourself. Treeflow writes the entire quiz funnel, scored results and follow-up emails, from your link in seconds.",
    eyebrow: "Treeflow vs Typeform",
    h1: "The Typeform alternative for lead-scoring quiz funnels",
    subhead:
      "Typeform is a great form builder, but you still write every question. Treeflow writes the whole quiz funnel, scored results, and follow-up emails from your link in seconds, then hands it to you to edit.",
    rows: SHARED_ROWS,
    faqs: [
      {
        q: "How is Treeflow different from Typeform?",
        a: "Typeform is a form and quiz builder you design yourself. Treeflow drafts a complete lead-scoring funnel for you from a link or a sentence, including the results and follow-up emails, so you start from a finished quiz.",
      },
      {
        q: "Does Treeflow score answers and recommend a result?",
        a: "Yes. Treeflow drafts scored outcomes and the logic that maps answers to a recommended result, which is the core of a quiz funnel rather than a plain form.",
      },
      {
        q: "Can I edit the questions and styling?",
        a: "Yes. You can rewrite anything the AI drafts and set your brand color before publishing.",
      },
      {
        q: "Is there a free plan?",
        a: "Yes. You can build and publish a real, working quiz on the free plan.",
      },
    ],
    intro:
      "Typeform is one of the most popular tools for building forms and conversational quizzes, and many people search for a Typeform alternative when they want a lead-scoring quiz funnel rather than a form to fill in. As with most builders in this category, you design the experience yourself: writing the questions, setting up any scoring, and connecting follow-up separately. Treeflow instead writes the whole funnel, questions, scored outcomes, and a follow-up email sequence, from your link in seconds, so you can publish a working quiz funnel in minutes and adjust the copy to match your voice.",
  },
  {
    slug: "scoreapp",
    name: "ScoreApp",
    metaTitle: "Treeflow vs ScoreApp | AI-Built Quiz Funnels",
    metaDescription:
      "ScoreApp gives you a scorecard builder. Treeflow writes the whole quiz funnel, questions, scored results and follow-up emails, from your link in seconds.",
    eyebrow: "Treeflow vs ScoreApp",
    h1: "The ScoreApp alternative that drafts the whole funnel",
    subhead:
      "ScoreApp is built around scorecards you set up yourself. Treeflow writes the questions, scored results, and follow-up emails from your link in seconds, so you start from a finished funnel.",
    rows: SHARED_ROWS,
    faqs: [
      {
        q: "How is Treeflow different from ScoreApp?",
        a: "ScoreApp is a scorecard and quiz builder you configure yourself. Treeflow drafts the full funnel for you from a link or a sentence, including scored results and a follow-up email sequence, so the first screen is a finished quiz.",
      },
      {
        q: "Does Treeflow handle scored results?",
        a: "Yes. Treeflow drafts the outcomes and the logic that maps answers to a recommended result, then lets you adjust everything before publishing.",
      },
      {
        q: "Do I need a website?",
        a: "No. Each quiz gets a hosted link to share in a bio or as a QR code, no website required.",
      },
      {
        q: "Is there a free plan?",
        a: "Yes. You can build and publish a real, working quiz on the free plan.",
      },
    ],
    intro:
      "ScoreApp is a popular tool for building quizzes and scorecards that capture and qualify leads, and people often compare it with other tools when the setup feels like a lot of manual work. The category norm holds here: you choose a template, then write the questions, configure the scoring, and arrange follow-up yourself. Treeflow writes the entire funnel, questions, scored outcomes, and a follow-up email sequence, from your link in seconds, so you can launch a working quiz funnel in minutes and focus on tailoring it rather than building it from a blank quiz.",
  },
  {
    slug: "interact",
    name: "Interact",
    metaTitle: "Treeflow vs Interact | AI Quiz Funnel Builder",
    metaDescription:
      "Interact gives you a quiz builder and templates. Treeflow writes the whole funnel, scored results and follow-up emails, from your link in seconds.",
    eyebrow: "Treeflow vs Interact",
    h1: "The Interact alternative that writes your quiz for you",
    subhead:
      "Interact gives you templates and a builder, but you still write every question. Treeflow writes the whole quiz funnel, scored results, and follow-up emails from your link in seconds, ready for you to edit.",
    rows: SHARED_ROWS,
    faqs: [
      {
        q: "How is Treeflow different from Interact?",
        a: "Interact is a quiz builder with templates you customize yourself. Treeflow drafts the complete funnel for you from a link or a sentence, including scored results and follow-up emails, so you start from a finished quiz instead of a template.",
      },
      {
        q: "Can I customize what Treeflow generates?",
        a: "Yes. Every question, result, and email is editable, and you can set your brand color before you publish.",
      },
      {
        q: "Do I need a website to publish?",
        a: "No. Treeflow hosts the quiz and gives you a link to share in a bio or as a QR code.",
      },
      {
        q: "Is there a free plan?",
        a: "Yes. You can build and publish a real, working quiz on the free plan.",
      },
    ],
    intro:
      "Interact is a well-established quiz builder used by creators and businesses to generate and segment leads, and people often look for an Interact alternative when they want the funnel built rather than assembled. As with most tools in the category, you pick a template and then write the questions, set up the scoring, and connect follow-up yourself. Treeflow writes the whole funnel, questions, scored outcomes, and a follow-up email sequence, from your link in seconds, so you can publish a working quiz funnel in minutes and spend your time editing the copy instead of building from scratch.",
  },
];

export function getComparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
