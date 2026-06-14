"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { QuizConfig } from "@/lib/schema";

// The public quiz player — NOT our twilight aesthetic (STYLE.md §6a). Clean,
// neutral, mobile-first; the owner's surface. Fires the visitor funnel
// (view → start → question_answered → completed → lead_captured) and captures a
// lead before revealing the outcome (default placement).
type Phase = "welcome" | "questions" | "lead" | "outcome";

const DEFAULT_ACCENT = "#0a0a0a"; // neutral ink — the player is the owner's surface, not our brand

// Validate + normalize the owner's stored accent (the editor color input yields
// #rrggbb; anything malformed falls back to the neutral default).
function normalizeAccent(value: string | null): string {
  if (!value) return DEFAULT_ACCENT;
  const v = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : DEFAULT_ACCENT;
}

// Contrast guard: pick black or white text on the accent by WCAG relative
// luminance, so a light brand color never gets unreadable white button text.
function readableTextOn(hex: string): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L =
    0.2126 * toLin((n >> 16) & 255) + 0.7152 * toLin((n >> 8) & 255) + 0.0722 * toLin(n & 255);
  return L > 0.5 ? "#0a0a0a" : "#ffffff";
}

// Effort estimate for the welcome screen: ~10s per question, phrased in seconds
// up to 90s, then rounded minutes.
function effortEstimate(questionCount: number): string {
  const seconds = questionCount * 10;
  if (seconds <= 90) return `about ${seconds} seconds`;
  return `about ${Math.round(seconds / 60)} minutes`;
}

export default function QuizPlayer({
  quizId,
  title,
  config,
  branding,
  placement,
  whatsapp,
  accent,
}: {
  quizId: string;
  title: string;
  config: QuizConfig;
  branding: boolean;
  placement: "before_results" | "after_results";
  whatsapp: string | null;
  accent: string | null;
}) {
  const questions = config.questions;
  const accentColor = normalizeAccent(accent);
  const accentContrast = readableTextOn(accentColor);
  const [phase, setPhase] = useState<Phase>("welcome");
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

  function fireEvent(
    event_type: string,
    question_id?: string,
    once?: string,
    outcome_id?: string,
  ) {
    if (once) {
      if (fired.current.has(once)) return;
      fired.current.add(once);
    }
    fetch("/api/quiz-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quiz_id: quizId,
        event_type,
        question_id,
        session_id: sessionId.current,
        outcome_id,
      }),
    }).catch(() => {});
  }

  // view (once on mount)
  useEffect(() => {
    fireEvent("view", undefined, "view");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute the outcome from accumulated tag scores vs each outcome's
  // match_logic. Extracted so `answer()` can resolve the outcome for the FINAL
  // answer set before React state has caught up (the `completed` event carries
  // outcome_id for the §5.8 outcome-distribution analytics).
  function resolveOutcome(answerSet: Record<string, string>) {
    const tally: Record<string, number> = {};
    for (const q of questions) {
      const chosen = answerSet[q.id];
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
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const outcome = useMemo(() => resolveOutcome(answers), [answers, questions, config.outcomes]);

  function answer(questionId: string, optionId: string) {
    const nextAnswers = { ...answers, [questionId]: optionId };
    setAnswers(nextAnswers);
    fireEvent("question_answered", questionId);
    const isLast = qIndex >= questions.length - 1;
    if (isLast) {
      fireEvent("completed", undefined, "completed", resolveOutcome(nextAnswers)?.id);
      setPhase(placement === "before_results" ? "lead" : "outcome");
    } else {
      setQIndex((i) => i + 1);
    }
  }

  return (
    <main
      className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6 sm:px-5 sm:py-12"
      style={{ "--accent": accentColor, "--accent-contrast": accentContrast } as React.CSSProperties}
    >
      <div className="flex-1 rounded-[22px] bg-white p-6 shadow-soft ring-1 ring-ink-950/5 sm:p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-950">{title}</h1>
        </header>

        {phase === "welcome" && (
          <WelcomeStep
            questionCount={questions.length}
            onStart={() => {
              fireEvent("start", undefined, "start");
              setPhase("questions");
            }}
          />
        )}

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
            Made with Treeflow
          </a>
        </footer>
      )}
    </main>
  );
}

// Start screen (design-pass §2.2): sets the effort expectation up front (total
// question count + time estimate), which lifts completion. `start` fires on the
// tap, making view→start a true intent signal.
function WelcomeStep({
  questionCount,
  onStart,
}: {
  questionCount: number;
  onStart: () => void;
}) {
  return (
    <div className="py-2">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
        {questionCount} questions · {effortEstimate(questionCount)}
      </p>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-600">
        Answer a few quick questions to get your personalized result.
      </p>
      <button
        type="button"
        onClick={onStart}
        style={{ backgroundColor: "var(--accent)", color: "var(--accent-contrast)" }}
        className="mt-7 w-full rounded-full px-6 py-4 text-xs font-bold uppercase tracking-[0.1em] shadow-pill transition-all hover:brightness-95 active:scale-[0.98]"
      >
        Start →
      </button>
    </div>
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
  // Fill by (index+1)/total so Q1 already shows progress, never 0% (design-pass
  // §2.3). The step count leads; the bar is a demoted hairline below it.
  const pct = Math.round(((index + 1) / total) * 100);
  return (
    <div>
      <p className="mb-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink-700">
        Question {index + 1} of {total}
      </p>
      <div className="mb-6 h-1 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: "var(--accent)" }}
        />
      </div>
      <h2 className="mb-6 text-xl font-bold leading-snug tracking-[-0.02em]">{question.text}</h2>
      <div className="space-y-3">
        {question.options.map((o) => {
          const isSel = selected === o.id;
          return (
            <button
              key={o.id}
              onClick={() => onSelect(o.id)}
              style={
                isSel
                  ? {
                      borderColor: "var(--accent)",
                      backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)",
                    }
                  : undefined
              }
              className={`w-full rounded-2xl border px-5 py-4 text-left text-[15px] font-medium leading-snug transition-all active:scale-[0.99] ${
                isSel ? "" : "border-ink-200/80 hover:border-ink-300 hover:bg-ink-50/50"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Mirrors the server's email check (Zod `.email()`) so the visitor gets an
// instant, specific message instead of a round-trip to a generic error.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    // Validate before any network call, and say exactly what's wrong.
    if (!trimmedName) {
      setError("Please enter your name so we know what to call you.");
      return;
    }
    if (!trimmedEmail) {
      setError("Please enter your email so we can send your results.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError("That email address doesn't look right. Please check it, like you@example.com.");
      return;
    }
    if (!consent) {
      setError("Please tick the box to agree to be contacted, then try again.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quiz_id: quizId,
          name: trimmedName,
          email: trimmedEmail,
          phone: phone.trim() || undefined,
          answers,
          outcome_id: outcomeId,
          session_id: sessionId,
          consent: true,
        }),
      });
      if (res.ok) {
        onDone();
        return;
      }
      // Map the server's status to a specific, human message.
      if (res.status === 422) {
        setError("That email address doesn't look right. Please check it, like you@example.com.");
      } else if (res.status === 404) {
        setError("This quiz isn't accepting responses right now. Please try again later.");
      } else {
        setError("We couldn't save your details just now. Please try again in a moment.");
      }
    } catch {
      setError("We couldn't reach the server. Please check your connection and try again.");
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
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (error) setError(null);
        }}
        placeholder="Your name"
        autoComplete="given-name"
        className="w-full rounded-full border border-ink-200 px-5 py-3.5 text-[15px] outline-none transition-colors focus:border-[var(--accent)]"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (error) setError(null);
        }}
        placeholder="you@email.com"
        className="w-full rounded-full border border-ink-200 px-5 py-3.5 text-[15px] outline-none transition-colors focus:border-[var(--accent)]"
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone (optional)"
        className="w-full rounded-full border border-ink-200 px-5 py-3.5 text-[15px] outline-none transition-colors focus:border-[var(--accent)]"
      />
      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-500">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span>I agree to be contacted about my results and consent to my data being processed.</span>
      </label>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <button
        type="submit"
        disabled={loading || !name.trim() || !email.trim() || !consent}
        style={{ backgroundColor: "var(--accent)", color: "var(--accent-contrast)" }}
        className="w-full rounded-full px-6 py-3.5 text-xs font-bold uppercase tracking-[0.1em] shadow-pill transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-40"
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
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-contrast)" }}
            className="inline-block rounded-full px-8 py-4 text-xs font-bold uppercase tracking-[0.1em] shadow-pill transition-all hover:brightness-95 active:scale-[0.98]"
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
