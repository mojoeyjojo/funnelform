// Programmatic-SEO landing pages (one per niche keyword). Each entry is the ONLY
// thing that differs between pages: the route template in `src/app/[niche]` reads
// this data and renders a static page per slug. Adding a keyword = appending one
// object here, nothing else.
//
// Keep every entry genuinely distinct. Google treats near-identical templated
// pages as doorway/thin content; the example quiz, pain/resolution copy, and
// testimonials are what make each page real. Rule of thumb: cover the niche name
// and you should still be able to tell which vertical the page is for.

export type SampleQuestion = {
  text: string;
  options: string[];
};

export type SampleOutcome = {
  name: string;
  description: string;
};

export type NicheFaq = {
  q: string;
  a: string;
};

export type Testimonial = {
  /** Real name. */
  name: string;
  /** The reviewer's job title only, no business name, e.g. "Med Spa Owner". */
  role: string;
  /** A specific, attributed result tied to this niche. Specific beats generic. */
  result: string;
  /** Optional headshot. A path under /public, e.g. "/testimonials/lara.jpg".
   *  When omitted, the card falls back to the reviewer's initials. */
  avatar?: string;
};

export type Niche = {
  /** URL segment, e.g. "med-spas" -> /med-spas. Lowercase, hyphenated. */
  slug: string;
  /** <title> tag, ~55 chars. Keyword + brand. */
  metaTitle: string;
  /** Meta description, ~150 chars. Drives click-through, not ranking. */
  metaDescription: string;

  // --- Section 1: Hero ---
  /** Small label above the headline, e.g. "For med spas". */
  eyebrow: string;
  /** Headline: names who it is for and the relief. */
  h1: string;
  /** One or two lines: what Treeflow does for them. */
  subhead: string;

  // --- Section 2: Proof strip is platform-wide; see SITE_STATS below. ---

  // --- Section 3: Problem to solution ---
  /** Name the pain in their words (2-3 lines). */
  pain: string;
  /** Resolve it (1-2 lines). */
  resolution: string;

  /** The example quiz: the differentiator. Shown on a phone in the hero and used
   *  for the "scored result" benefit visual. Must read like a real quiz for this
   *  vertical, not a noun swap. */
  exampleQuiz: {
    title: string;
    questions: SampleQuestion[];
    outcomes: SampleOutcome[];
  };

  // --- Section 5: Testimonials ---
  /** 2-3 attributed, specific, niche-matched results. */
  testimonials: Testimonial[];

  // --- Section 6: FAQ ---
  /** Real blockers for this niche. Doubles as SEO content. */
  faqs: NicheFaq[];

  /** Indexable body paragraph using the keyword naturally. Rendered small near
   *  the footer for SEO without cluttering the conversion flow. */
  intro: string;
};

export const NICHES: Niche[] = [
  {
    slug: "med-spas",
    metaTitle: "Quiz Funnels for Med Spas | Treeflow",
    metaDescription:
      "Turn website and Instagram visitors into booked consultations. Treeflow builds a treatment-match quiz that recommends the right service and captures the lead.",

    eyebrow: "For med spas",
    h1: "For med spas that would rather book treatments than build a funnel",
    subhead:
      "Treeflow's AI builds your entire treatment-match quiz from one sentence about your spa: questions, results, follow-up emails. You just edit and publish. No website needed.",

    pain: "You have the following and the DMs come in. But turning that attention into booked treatments means building a funnel, and every quiz tool hands you a blank builder and walks away. So it never gets done.",
    resolution:
      "Treeflow does the building for you. You start with a finished treatment-match funnel, not an empty screen.",

    exampleQuiz: {
      title: "Which treatment is right for your skin?",
      questions: [
        {
          text: "What bothers you most when you look in the mirror?",
          options: [
            "Fine lines and wrinkles",
            "Dull, tired-looking skin",
            "Acne or breakouts",
            "Uneven tone and dark spots",
          ],
        },
        {
          text: "How much downtime can you take?",
          options: [
            "None, I have plans this week",
            "A day or two is fine",
            "I can rest for several days",
          ],
        },
        {
          text: "What is your main goal right now?",
          options: [
            "Look refreshed for an event",
            "Start a long-term skincare routine",
            "Fix a specific concern fast",
          ],
        },
      ],
      outcomes: [
        {
          name: "Hydrafacial Glow",
          description:
            "A gentle, no-downtime deep clean to brighten dull, tired skin before a big day.",
        },
        {
          name: "Injectable Refresh",
          description:
            "Targeted Botox or filler to soften fine lines, with visible results in days.",
        },
        {
          name: "Resurfacing Plan",
          description:
            "A chemical peel or laser series to even out tone and clear stubborn spots over time.",
        },
      ],
    },

    // Placeholder testimonials; replace with real, attributed quotes before
    // launch. First names match the headshot files in public/testimonials/; the
    // last names are made up. `avatar` points at each headshot.
    testimonials: [
      {
        name: "Hùng Tran",
        role: "Med Spa Owner",
        result:
          "The quiz booked 23 consultations in our first month, mostly from people who found us on Instagram.",
        avatar: "/testimonials/hung_jbjg7g.jpg",
      },
      {
        name: "Brenda Walsh",
        role: "Clinic Director",
        result:
          "We finally capture the people who used to just browse and leave. Over 40 new leads so far, with zero extra work.",
        avatar: "/testimonials/brenda_hjuh67y.jpg",
      },
      {
        name: "Claudia Moreau",
        role: "Founder",
        result:
          "Clients show up already knowing which treatment they want, so consultations are faster and they book on the spot.",
        avatar: "/testimonials/claudia_hghyg6g.jpg",
      },
      {
        name: "Jason Albright",
        role: "Marketing Manager",
        result:
          "Our cost per lead dropped because the quiz does the qualifying that my ads used to pay for.",
        avatar: "/testimonials/jason_huyt7.jpg",
      },
      {
        name: "Jonathan Pierce",
        role: "Co-founder",
        result:
          "We launched in an afternoon and had bookings by the weekend. No developer, no website rebuild.",
        avatar: "/testimonials/jonathan_uhuhu7yy.jpg",
      },
      {
        name: "Leandro Costa",
        role: "Lead Esthetician",
        result:
          "I share the quiz in every story now. It quietly builds my client list while I am busy with clients.",
        avatar: "/testimonials/leandro_jhuhgftrd5d.jpg",
      },
      {
        name: "Martha Ellison",
        role: "Practice Manager",
        result:
          "It cut the back-and-forth with new enquiries. The quiz answers tell us exactly what they want before they call.",
        avatar: "/testimonials/martha_huygtr3.jpg",
      },
      {
        name: "Mason Reed",
        role: "Front Desk Manager",
        result:
          "We put the QR code at reception and walk-ins fill it out while they wait. Nothing slips through anymore.",
        avatar: "/testimonials/mason_huh5fg.jpg",
      },
      {
        name: "Mauricio Vega",
        role: "Aesthetic Nurse",
        result:
          "Patients arrive with a treatment in mind, so my consultations are shorter and far more of them convert.",
        avatar: "/testimonials/mauricio_jhuuhg7ftr.jpg",
      },
      {
        name: "Melisa Yilmaz",
        role: "Laser Technician",
        result:
          "Bookings used to stall in the DMs. Now people get a recommendation and a time, and they actually show up.",
        avatar: "/testimonials/melisa_hjghf4df.jpg",
      },
      {
        name: "Taylor Brooks",
        role: "Spa Director",
        result:
          "Our quietest month turned into our busiest. The quiz keeps the calendar full without me chasing anyone.",
        avatar: "/testimonials/taylor_hugyfcgvbn9.jpg",
      },
    ],

    faqs: [
      {
        q: "Do I need a website?",
        a: "No. Share the quiz link in your Instagram bio or print a QR code for the front desk.",
      },
      {
        q: "Will it sound like my spa?",
        a: "Yes. You edit every line and set your brand color before you publish.",
      },
      {
        q: "Is the free plan actually usable?",
        a: "Yes. You can build and publish a real, working quiz on the free plan.",
      },
      {
        q: "How long does it take?",
        a: "Minutes. The AI drafts the whole funnel in seconds, then you tweak and publish.",
      },
    ],

    intro:
      "Running a med spa means competing for attention on Instagram, Google, and walk-in foot traffic, and most of that interest never turns into an appointment. A treatment-match quiz gives visitors an instant, personalized recommendation while quietly capturing their name and contact details. Treeflow builds the whole funnel from a link or a short description, so you can launch one this afternoon without a designer or a developer.",
  },
];

export function getNiche(slug: string): Niche | undefined {
  return NICHES.find((n) => n.slug === slug);
}

// Platform-wide proof numbers shown in the strip under every niche hero. Manual
// on purpose: update these by hand as the product grows. Keep them honest. The
// `value` is a free string so you can write "1,200+" or "12k". Set a value to an
// empty string to hide that stat; if all three are empty the strip won't render.
export const SITE_STATS: { value: string; label: string }[] = [
  { value: "1,200+", label: "businesses building" },
  { value: "18,000+", label: "leads captured" },
  { value: "3,400+", label: "quizzes published" },
];
