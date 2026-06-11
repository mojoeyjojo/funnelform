"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { QuizConfig } from "@/lib/schema";

// The public quiz player — NOT our twilight aesthetic (STYLE.md §6a). Clean,
// neutral, mobile-first; the owner's surface. Fires the visitor funnel
// (view → start → question_answered → completed → lead_captured) and captures a
// lead before revealing the outcome (default placement).
type Phase = "questions" | "lead" | "outcome";

export default function QuizPlayer({
  quizId,
  title,
  config,
  branding,
  placement,
  whatsapp,
}: {
  quizId: string;
  title: string;
  config: QuizConfig;
  branding: boolean;
  placement: "before_results" | "after_results";
  whatsapp: string | null;
}) {
  const questions = config.questions;
  const [phase, setPhase] = useState<Phase>("questions");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const fired = useRef<Set<string>>(new Set());
  const sessionId = useRef<string>("");

  // Stable anonymous visitor session id for quiz_events.
  if (!sessionId.current && typeof window !== "undefined") {
    const existing = window.localStorage.getItem("ff_visitor_session");
    sessionId.current =
      existing ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    window.localStorage.setItem("ff_visitor_session", sessionId.current);
  }

  function fireEvent(event_type: string, question_id?: string, once?: string) {
    if (once) {
      if (fired.current.has(once)) return;
      fired.current.add(once);
    }
    fetch("/api/quiz-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quiz_id: quizId, event_type, question_id, session_id: sessionId.current }),
    }).catch(() => {});
  }

  // view (once on mount)
  useEffect(() => {
    fireEvent("view", undefined, "view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute the outcome from accumulated tag scores vs each outcome's match_logic.
  const outcome = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const q of questions) {
      const chosen = answers[q.id];
      const opt = q.options.find((o) => o.id === chosen);
      if (!opt) continue;
      for (const [tag, pts] of Object.entries(opt.score)) {
        tally[tag] = (tally[tag] ?? 0) + pts;
      }
    }
    const scored = config.outcomes.map((o) => ({
      outcome: o,
      score: tally[o.match_logic.primary_tag] ?? 0,
      qualifies: (tally[o.match_logic.primary_tag] ?? 0) >= o.match_logic.min_score,
    }));
    const qualifying = scored.filter((s) => s.qualifies);
    const pool = qualifying.length > 0 ? qualifying : scored;
    pool.sort((a, b) => b.score - a.score);
    return pool[0]?.outcome ?? config.outcomes[0];
  }, [answers, questions, config.outcomes]);

  function answer(questionId: string, optionId: string) {
    fireEvent("start", undefined, "start");
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
    fireEvent("question_answered", questionId);
    const isLast = qIndex >= questions.length - 1;
    if (isLast) {
      fireEvent("completed", undefined, "completed");
      setPhase(placement === "before_results" ? "lead" : "outcome");
    } else {
      setQIndex((i) => i + 1);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6 sm:px-5 sm:py-12">
      <div className="flex-1 rounded-[22px] bg-white p-6 shadow-soft ring-1 ring-ink-950/5 sm:p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950">{title}</h1>
        </header>

        {phase === "questions" && (
          <QuestionStep
            index={qIndex}
            total={questions.length}
            question={questions[qIndex]}
            selected={answers[questions[qIndex].id]}
            onSelect={(optId) => answer(questions[qIndex].id, optId)}
          />
        )}

        {phase === "lead" && (
          <LeadForm
            quizId={quizId}
            answers={answers}
            outcomeId={outcome?.id}
            sessionId={sessionId.current}
            onDone={() => setPhase("outcome")}
          />
        )}

        {phase === "outcome" && outcome && (
          <OutcomeView outcome={outcome} whatsapp={whatsapp} quizTitle={title} />
        )}
      </div>

      {branding && (
        <footer className="mt-6 text-center">
          <a
            href="https://funnelform.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-signal-600 ring-1 ring-ink-950/5 transition-colors hover:bg-white"
          >
            Made with Funnelform
          </a>
        </footer>
      )}
    </main>
  );
}

function QuestionStep({
  index,
  total,
  question,
  selected,
  onSelect,
}: {
  index: number;
  total: number;
  question: QuizConfig["questions"][number];
  selected?: string;
  onSelect: (optionId: string) => void;
}) {
  const pct = Math.round(((index) / total) * 100);
  return (
    <div>
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-full rounded-full bg-signal-600 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
        Question {index + 1} of {total}
      </p>
      <h2 className="mb-6 text-xl font-bold leading-snug tracking-[-0.02em]">{question.text}</h2>
      <div className="space-y-3">
        {question.options.map((o) => (
          <button
            key={o.id}
            onClick={() => onSelect(o.id)}
            className={`w-full rounded-2xl border px-5 py-4 text-left text-[15px] font-medium leading-snug transition-all active:scale-[0.99] ${
              selected === o.id
                ? "border-signal-600 bg-signal-600/5"
                : "border-ink-200/80 hover:border-signal-500 hover:bg-ink-50/50"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LeadForm({
  quizId,
  answers,
  outcomeId,
  sessionId,
  onDone,
}: {
  quizId: string;
  answers: Record<string, string>;
  outcomeId?: string;
  sessionId: string;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !consent) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz_id: quizId,
          email: email.trim(),
          phone: phone.trim() || undefined,
          answers,
          outcome_id: outcomeId,
          session_id: sessionId,
          consent: true,
        }),
      });
      if (res.ok) onDone();
      else setError("Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h2 className="text-xl font-bold leading-snug tracking-[-0.02em]">
          Almost there. Where should we send your results?
        </h2>
        <p className="mt-1 text-sm text-ink-500">Enter your email to see your result.</p>
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@email.com"
        className="w-full rounded-full border border-ink-200 px-5 py-3.5 text-[15px] outline-none transition-colors focus:border-signal-600"
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional)"
        className="w-full rounded-full border border-ink-200 px-5 py-3.5 text-[15px] outline-none transition-colors focus:border-signal-600"
      />
      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-500">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 accent-[#3834ff]"
        />
        <span>I agree to be contacted about my results and consent to my data being processed.</span>
      </label>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <button
        type="submit"
        disabled={loading || !email.trim() || !consent}
        className="w-full rounded-full bg-ink-950 px-6 py-3.5 text-xs font-bold uppercase tracking-[0.1em] text-white shadow-pill transition-all hover:bg-signal-600 active:scale-[0.98] disabled:opacity-40"
      >
        {loading ? "…" : "See my result →"}
      </button>
    </form>
  );
}

// Build a wa.me click-to-chat link to the business, prefilled with the result.
// wa.me wants digits only (no +, spaces, or punctuation). Returns null if the
// number isn't a plausible international phone (7–15 digits).
function whatsappLink(raw: string, quizTitle: string, outcomeName: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  const text = `Hi! I took your "${quizTitle}" quiz and my result was "${outcomeName}". I'd love to learn more.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function OutcomeView({
  outcome,
  whatsapp,
  quizTitle,
}: {
  outcome: QuizConfig["outcomes"][number];
  whatsapp: string | null;
  quizTitle: string;
}) {
  const waUrl = whatsapp ? whatsappLink(whatsapp, quizTitle, outcome.name) : null;
  return (
    <div className="text-center">
      <p className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
        Your result
      </p>
      <h2 className="mb-3 text-3xl font-extrabold tracking-[-0.035em]">{outcome.name}</h2>
      <p className="mx-auto mb-7 max-w-md text-[15px] leading-relaxed text-ink-600">
        {outcome.description}
      </p>
      {outcome.recommendations.length > 0 && (
        <div className="mb-8 rounded-2xl bg-ink-50 p-5">
          <p className="mb-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">
            Recommended for you
          </p>
          <ul className="space-y-1.5 text-[15px] font-semibold">
            {outcome.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col items-center gap-3">
        {outcome.cta.url && (
          <a
            href={outcome.cta.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full bg-ink-950 px-8 py-4 text-xs font-bold uppercase tracking-[0.1em] text-white shadow-pill transition-all hover:bg-signal-600 active:scale-[0.98]"
          >
            {outcome.cta.label || "Get started"} →
          </a>
        )}
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-7 py-3.5 text-xs font-bold uppercase tracking-[0.1em] text-white transition-all hover:brightness-95 active:scale-[0.98]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 1.67c2.2 0 4.27.86 5.83 2.42a8.2 8.2 0 0 1 2.42 5.82c0 4.54-3.7 8.24-8.25 8.24a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24zm4.52 9.84c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42l-.48-.01c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" />
            </svg>
            Continue on WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
