"use client";

import { useState } from "react";
import type { GeneratedQuiz } from "@/lib/schema";

// The editor content surface (mockup: 07-editor-light). Renders the quiz title,
// each question and outcome as an editable card, and the read-only follow-up
// sequence. Used only by the saved-quiz editor; it expects the `.editor-ui`
// neutral palette from its parent. `Label` is exported for reuse elsewhere.
//
// Scoring/routing (option tags + scores, outcome match_logic, cta.url) is hidden
// logic the owner does not edit: option tags show as a locked tag, and a hint
// reminds the owner they are editing words, not logic.
export function QuizView({
  quiz,
  onEdit,
  onRegenerate,
}: {
  quiz: GeneratedQuiz;
  onEdit: (path: string, mutate: (draft: GeneratedQuiz) => void) => void;
  onRegenerate?: (target: "question" | "outcome", index: number) => Promise<void>;
}) {
  const { config } = quiz;
  return (
    <div className="space-y-12">
      {/* Title */}
      <section>
        <SectionLabel>Quiz title</SectionLabel>
        <TextField
          value={quiz.title}
          onChange={(v) => onEdit("title", (d) => (d.title = v))}
          className="rounded-[14px] px-4 py-3.5 text-[18px] font-bold tracking-[-0.02em]"
          aria-label="Quiz title"
        />
      </section>

      {/* Questions */}
      {config.questions.map((q, qi) => (
        <section key={q.id} id={`sec-q-${qi}`} data-nav-section className="scroll-mt-6">
          <div className="mb-4 flex items-center justify-between">
            <SectionLabel>Question {String(qi + 1).padStart(2, "0")}</SectionLabel>
            {onRegenerate && <RegenButton onRun={() => onRegenerate("question", qi)} label="question" />}
          </div>
          <div className="rounded-[20px] border-[1.5px] border-[var(--hairline)] bg-[var(--e-surface-2)] p-6">
            <FieldLabel>Question text</FieldLabel>
            <TextField
              value={q.text}
              onChange={(v) => onEdit(`questions.${qi}.text`, (d) => (d.config.questions[qi].text = v))}
              className="rounded-[14px] px-4 py-3.5 text-[15px] font-medium"
            />

            <p className="mb-3 mt-5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--e-text-faint)]">
              Answer options
            </p>
            <div className="space-y-2">
              {q.options.map((o, oi) => (
                <div key={o.id} className="flex items-center gap-2.5">
                  <TextField
                    value={o.label}
                    onChange={(v) =>
                      onEdit(`questions.${qi}.options.${oi}.label`, (d) => (d.config.questions[qi].options[oi].label = v))
                    }
                    className="flex-1 rounded-full px-4 py-2.5 text-[13.5px] font-medium"
                  />
                  <LockTag>{o.tags.join(" / ")}</LockTag>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-[var(--hairline)] pt-4 text-[12px] text-[var(--e-text-faint)]">
              <LockIcon className="h-3.5 w-3.5 shrink-0" />
              Scoring and routing is handled automatically. Edit the words, not the logic.
            </div>
          </div>
        </section>
      ))}

      {/* Outcomes */}
      {config.outcomes.map((out, oi) => (
        <section key={out.id} id={`sec-o-${oi}`} data-nav-section className="scroll-mt-6">
          <div className="mb-4 flex items-center justify-between">
            <SectionLabel>Outcome</SectionLabel>
            {onRegenerate && <RegenButton onRun={() => onRegenerate("outcome", oi)} label="outcome" />}
          </div>
          <div className="rounded-[20px] border-[1.5px] border-[var(--hairline)] bg-[var(--e-surface-2)] p-6">
            <FieldLabel>Result name</FieldLabel>
            <TextField
              value={out.name}
              onChange={(v) => onEdit(`outcomes.${oi}.name`, (d) => (d.config.outcomes[oi].name = v))}
              className="rounded-[10px] px-3.5 py-2.5 text-[15px] font-bold"
            />

            <div className="mt-4">
              <FieldLabel>Description</FieldLabel>
              <TextField
                value={out.description}
                onChange={(v) => onEdit(`outcomes.${oi}.description`, (d) => (d.config.outcomes[oi].description = v))}
                multiline
                className="rounded-[14px] px-4 py-3.5 text-[15px] leading-relaxed"
              />
            </div>

            {out.recommendations.length > 0 && (
              <div className="mt-4">
                <FieldLabel>Recommendations</FieldLabel>
                <div className="rounded-[14px] border-[1.5px] border-dashed border-[var(--hairline)] bg-white px-4 py-3 text-[14px] text-[var(--e-text-2)]">
                  {out.recommendations.join(", ")}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2.5">
              <span className="w-20 shrink-0 text-[12px] font-semibold text-[var(--muted)]">Button text</span>
              <TextField
                value={out.cta.label}
                onChange={(v) => onEdit(`outcomes.${oi}.cta.label`, (d) => (d.config.outcomes[oi].cta.label = v))}
                placeholder="Book a call"
                className="flex-1 rounded-full px-3.5 py-2.5 text-[13px] font-medium"
              />
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              <span className="w-20 shrink-0 text-[12px] font-semibold text-[var(--muted)]">Button URL</span>
              <TextField
                value={out.cta.url}
                onChange={(v) => onEdit(`outcomes.${oi}.cta.url`, (d) => (d.config.outcomes[oi].cta.url = v))}
                placeholder="https://calendly.com/you/intro-call"
                className="flex-1 rounded-full px-3.5 py-2.5 text-[13px] font-medium"
              />
              <span className="shrink-0 font-mono text-[10px] font-bold text-[var(--e-text-faint)]">Optional</span>
            </div>
          </div>
        </section>
      ))}

      {/* Follow-up sequence (display only) */}
      <section id="sec-emails" data-nav-section className="scroll-mt-6">
        <SectionLabel>Follow-ups</SectionLabel>
        <p className="mb-4 mt-1 text-[13px] text-[var(--muted)]">
          We drafted a follow-up email sequence. Copy it into your email tool.
        </p>
        <div className="space-y-3">
          {config.email_sequence.map((m, i) => (
            <div
              key={i}
              className="rounded-[14px] border-[1.5px] border-dashed border-[var(--hairline)] bg-[var(--e-surface-2)] p-4"
            >
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--e-text-faint)]">
                +{m.send_offset_hours}h
              </p>
              <p className="mt-1.5 text-[14px] font-semibold text-[var(--foreground)]">{m.subject}</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--e-text-2)]">{m.body}</p>
              <p className="mt-2 text-[12px] font-semibold text-[var(--signal)]">{m.cta}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// A focused, editable text field. Neutral border, accent focus ring (mockup).
function TextField({
  value,
  onChange,
  className = "",
  multiline = false,
  placeholder,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  multiline?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const base =
    "w-full border-[1.5px] border-[var(--hairline)] bg-white text-[var(--foreground)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--e-text-faint)] focus:border-[var(--signal)] focus:shadow-[0_0_0_3px_var(--e-accent-glow)]";
  return multiline ? (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`${base} resize-none leading-relaxed ${className}`}
    />
  ) : (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`${base} ${className}`}
    />
  );
}

// Locked routing tag shown beside an answer option (read-only logic).
function LockTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--hairline)] bg-[var(--e-surface-3)] px-2.5 py-1.5 font-mono text-[10px] font-bold text-[var(--e-text-faint)]">
      <LockIcon className="h-2.5 w-2.5" />
      {children}
    </span>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// "Give me another take" reroll for a single question/outcome. Manages its own
// loading + error so the rest of the editor stays responsive.
function RegenButton({ onRun, label }: { onRun: () => Promise<void>; label: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        try {
          await onRun();
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--e-accent-glow)] px-3 py-1.5 text-[11px] font-bold text-[var(--signal)] transition-colors hover:bg-[var(--e-accent-glow-md)] disabled:opacity-50"
    >
      {busy ? "Regenerating…" : failed ? "Failed, retry" : `↻ Regenerate ${label}`}
    </button>
  );
}

// Mono section label (mockup `.section-label`), e.g. "Question 01". A readable
// grey header; the in-card FieldLabels stay lighter.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
      {children}
    </p>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--e-text-faint)]">
      {children}
    </p>
  );
}

// Kept for reuse by the generate flow (Generator imports this).
export function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </p>
  );
}
