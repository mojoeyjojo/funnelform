import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Funnelform",
  description: "How Funnelform collects, uses, and protects personal data.",
};

// Static privacy policy. Written against the real stack and data flows (Supabase,
// Stripe, Resend, Anthropic, Jina, Vercel, Google sign-in). It is an honest,
// plain-language baseline, not legal advice; have it reviewed before a launch
// push. "Last updated" is a static string on purpose (no impure Date in render).
const LAST_UPDATED = "June 14, 2026";

export default function PrivacyPage() {
  return (
    <main className="bg-white">
      <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8 sm:py-20">
        <Link
          href="/"
          className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--signal)]"
        >
          ← Home
        </Link>

        <h1 className="mt-4 text-3xl font-extrabold tracking-[-0.03em] text-ink-950 sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-400">
          Last updated {LAST_UPDATED}
        </p>

        <div className="mt-10 space-y-10 text-[15px] leading-relaxed text-ink-700">
          <Section title="Who we are">
            <p>
              Funnelform is an AI tool that helps business owners build quiz funnels, publish them,
              and collect leads. This policy explains what personal data we handle, why, and the
              choices you have. If you have any questions, contact us at{" "}
              <a className="text-signal-600 underline underline-offset-4" href="mailto:emails@odune.nl">
                emails@odune.nl
              </a>
              .
            </p>
          </Section>

          <Section title="Two kinds of data, two roles">
            <p>
              <strong>Your account data.</strong> When you sign up and use Funnelform, we are the
              data controller for your account and the quizzes you create.
            </p>
            <p className="mt-3">
              <strong>Your quiz respondents&rsquo; data.</strong> When someone takes a quiz you
              published and submits their details, you (the quiz owner) are the data controller for
              those leads. Funnelform acts as a processor on your behalf: we store and deliver that
              data to you, but it is yours, and you are responsible for how you contact those people
              and for the consent text shown on your quiz.
            </p>
          </Section>

          <Section title="Information we collect">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Account information:</strong> your email address, an authentication identifier
                (and, if you use Google sign-in, the basic profile your provider returns). Passwords
                are stored only as salted hashes by our authentication provider.
              </li>
              <li>
                <strong>Content you create:</strong> the quizzes, questions, outcomes, and settings
                you build, plus any website URL or business description you submit for generation.
              </li>
              <li>
                <strong>Lead data your quizzes collect:</strong> the name, email, optional phone
                number, quiz answers, and consent record submitted by your respondents.
              </li>
              <li>
                <strong>Usage and analytics events:</strong> anonymous, in-product events (for
                example quiz views, starts, completions) tied to a randomly generated session
                identifier, and basic acquisition attribution.
              </li>
              <li>
                <strong>Billing information:</strong> if you subscribe, your payment is handled by
                Stripe. We do not see or store your card number; we keep a Stripe customer reference
                and your plan status.
              </li>
            </ul>
          </Section>

          <Section title="How we use it">
            <ul className="list-disc space-y-2 pl-5">
              <li>To provide the service: generate, edit, publish, and host your quizzes.</li>
              <li>To capture leads and deliver them to you, including by email notification.</li>
              <li>To process subscriptions and manage your plan.</li>
              <li>To send essential account and service emails.</li>
              <li>To measure and improve the product using aggregated, mostly anonymous usage data.</li>
              <li>To keep the service secure and prevent abuse.</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal data, and we do not use it for third-party advertising.
            </p>
          </Section>

          <Section title="Service providers we share with">
            <p>
              We use a small set of trusted providers to run the service. They process data only to
              provide their part of it:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>
                <strong>Supabase</strong> — database, authentication, and storage.
              </li>
              <li>
                <strong>Vercel</strong> — application hosting and delivery.
              </li>
              <li>
                <strong>Stripe</strong> — subscription payments.
              </li>
              <li>
                <strong>Resend</strong> — transactional email (such as lead notifications).
              </li>
              <li>
                <strong>Anthropic</strong> — the AI model that generates your quiz from the website
                content or description you provide. We do not send your respondents&rsquo; lead data
                to the model.
              </li>
              <li>
                <strong>Jina</strong> — reads the public website URL you submit so the AI can use it.
              </li>
              <li>
                <strong>Google</strong> — only if you choose to sign in with Google.
              </li>
            </ul>
          </Section>

          <Section title="Cookies and local storage">
            <p>
              We use cookies and browser local storage that are strictly necessary to run the
              service: keeping you signed in, remembering a quiz-taker&rsquo;s session so events are
              not double counted, saving small preferences, and recording how you first arrived. We
              do not use third-party advertising or cross-site tracking cookies.
            </p>
          </Section>

          <Section title="How long we keep data">
            <ul className="list-disc space-y-2 pl-5">
              <li>Account and quiz data: for as long as your account is active.</li>
              <li>
                Deleted quizzes: moved to a trash for 30 days, then permanently removed along with
                their leads, unless you restore them first.
              </li>
              <li>Lead data: retained until you delete it or close your account.</li>
              <li>
                Billing records: kept as required for accounting and legal obligations.
              </li>
            </ul>
          </Section>

          <Section title="Your rights">
            <p>
              Depending on where you live, you may have the right to access, correct, export, or
              delete your personal data, and to object to or restrict certain processing. To exercise
              any of these, email us at{" "}
              <a className="text-signal-600 underline underline-offset-4" href="mailto:emails@odune.nl">
                emails@odune.nl
              </a>
              . If you are a quiz respondent and want your data removed, contact the business whose
              quiz you took, since they control that data; we will support them in honoring your
              request.
            </p>
          </Section>

          <Section title="International transfers">
            <p>
              Our providers may process data on servers located outside your country, including in
              the United States. Where required, transfers rely on appropriate safeguards such as
              standard contractual clauses.
            </p>
          </Section>

          <Section title="Security">
            <p>
              We protect data with encryption in transit, scoped database access controls, and
              least-privilege practices. No system is perfectly secure, but we work to keep your data
              safe and to limit who can access it.
            </p>
          </Section>

          <Section title="Children">
            <p>
              Funnelform is not intended for children, and we do not knowingly collect personal data
              from anyone under 16.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy as the product evolves. When we make material changes, we will
              update the date above and, where appropriate, let you know.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about this policy or your data? Email{" "}
              <a className="text-signal-600 underline underline-offset-4" href="mailto:emails@odune.nl">
                emails@odune.nl
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold tracking-[-0.01em] text-ink-950">{title}</h2>
      {children}
    </section>
  );
}
