import type { Niche } from "@/content/niches";

// The homepage content, shaped exactly like a niche so it can drive the SAME
// marketing template (src/components/marketing.tsx). The homepage is the generic,
// any-business version; the niche pages are the vertical-specific ones. The only
// structural difference is the hero action: the homepage renders the wizard
// inline (see src/app/page.tsx), so the fields below are pure marketing copy.
//
// Note: the testimonial carousel animation is tuned for ELEVEN cards (see the
// ff-marquee keyframes in globals.css). Keep this list at eleven and reuse the
// shared headshots in /public/testimonials.
export const LANDING: Niche = {
  slug: "__home__",
  metaTitle: "Treeflow | AI quiz funnels for your business",
  metaDescription:
    "Paste your link and watch a complete quiz funnel build itself: questions, scored outcomes, and a follow-up sequence. Capture and qualify leads in minutes.",

  eyebrow: "AI quiz funnels for any business",
  h1: "Paste your link. Watch the funnel build itself.",
  subhead:
    "One URL in, a complete quiz funnel out: questions, scored outcomes, and a follow-up sequence, in seconds. No website needed.",

  pain: "You have traffic and interest, but turning it into customers means building a funnel, and every quiz tool hands you a blank builder and walks away. So it never gets done.",
  resolution:
    "Treeflow does the building for you. You start with a finished funnel, not an empty screen.",

  exampleQuiz: {
    title: "Which option is right for you?",
    questions: [
      {
        text: "What are you trying to get done right now?",
        options: [
          "Get more qualified leads",
          "Grow my email list",
          "Book more calls",
          "Sell a specific offer",
        ],
      },
      {
        text: "How are people finding you today?",
        options: ["Instagram or social", "Google or ads", "Word of mouth"],
      },
      {
        text: "What is your biggest bottleneck?",
        options: ["Too few leads", "Leads that never convert", "No time to follow up"],
      },
    ],
    outcomes: [
      {
        name: "The Lead Engine",
        description:
          "A scored quiz that captures contacts and tells you who is ready to buy, on autopilot.",
      },
      {
        name: "The List Builder",
        description: "Every result ends in a strong opt-in, so your email list grows on its own.",
      },
      {
        name: "The Closer",
        description:
          "Hot leads go straight to your booking link or WhatsApp while they are still warm.",
      },
    ],
  },

  // Generic, cross-industry results. Reuses the shared headshots; names match the
  // files in /public/testimonials, roles and quotes are placeholders to replace
  // with real ones before launch.
  testimonials: [
    {
      name: "Hùng Tran",
      role: "Agency Owner",
      result:
        "We spun up a quiz funnel for a client in an afternoon and it booked 23 calls in the first month.",
      avatar: "/testimonials/hung_jbjg7g.jpg",
    },
    {
      name: "Brenda Walsh",
      role: "Course Creator",
      result:
        "People used to browse and leave. Now they get a result and join my list. Over 40 new leads so far.",
      avatar: "/testimonials/brenda_hjuh67y.jpg",
    },
    {
      name: "Claudia Moreau",
      role: "Founder",
      result:
        "Leads arrive already knowing which offer fits them, so my sales calls are shorter and close faster.",
      avatar: "/testimonials/claudia_hghyg6g.jpg",
    },
    {
      name: "Jason Albright",
      role: "Marketing Manager",
      result:
        "Our cost per lead dropped because the quiz does the qualifying our ads used to pay for.",
      avatar: "/testimonials/jason_huyt7.jpg",
    },
    {
      name: "Jonathan Pierce",
      role: "Co-founder",
      result: "We launched in an afternoon and had leads by the weekend. No developer, no rebuild.",
      avatar: "/testimonials/jonathan_uhuhu7yy.jpg",
    },
    {
      name: "Leandro Costa",
      role: "Coach",
      result:
        "I share the quiz in every story now. It quietly builds my list while I am busy with clients.",
      avatar: "/testimonials/leandro_jhuhgftrd5d.jpg",
    },
    {
      name: "Martha Ellison",
      role: "Operations Lead",
      result:
        "It cut the back-and-forth with new enquiries. The answers tell us what people want before they call.",
      avatar: "/testimonials/martha_huygtr3.jpg",
    },
    {
      name: "Mason Reed",
      role: "Small Business Owner",
      result: "We put a QR code on the counter and walk-ins fill it out while they wait.",
      avatar: "/testimonials/mason_huh5fg.jpg",
    },
    {
      name: "Mauricio Vega",
      role: "Consultant",
      result:
        "Prospects arrive with an offer in mind, so my consultations are shorter and far more of them convert.",
      avatar: "/testimonials/mauricio_jhuuhg7ftr.jpg",
    },
    {
      name: "Melisa Yilmaz",
      role: "Solo Founder",
      result:
        "Bookings used to stall in the DMs. Now people get a recommendation and a time, and they show up.",
      avatar: "/testimonials/melisa_hjghf4df.jpg",
    },
    {
      name: "Taylor Brooks",
      role: "E-commerce Owner",
      result:
        "Our quietest month turned into our busiest. The quiz keeps leads coming without me chasing anyone.",
      avatar: "/testimonials/taylor_hugyfcgvbn9.jpg",
    },
  ],

  faqs: [
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
  ],

  intro:
    "Treeflow turns a link or a short description into a complete quiz funnel: questions written in your voice, scored outcomes that recommend the right next step, and a follow-up email sequence drafted for you. Visitors get an instant, personalized recommendation while you quietly capture their name and contact details, so the interest you already have starts turning into booked customers. Build and publish your first funnel in minutes, with no designer and no developer.",
};
