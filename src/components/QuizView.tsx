"use client";

import type { GeneratedQuiz } from "@/lib/schema";
import type { OutputRating } from "@/lib/types";

// Shared quiz view, used by the generate flow (with the one-tap rating), the
// saved-quiz editor (no rating), and the free-tool preview (`readOnly`). When
// readOnly, fields render as plain text instead of editable inputs.
export function QuizView({
  quiz,
  rating,
  onRate,
  onEdit,
  readOnly = false,
}: {
  quiz: GeneratedQuiz;
  rating?: OutputRating | null;
  onRate?: (r: OutputRating) => void;
  onEdit: (path: string, mutate: (draft: GeneratedQuiz) => void) => void;
  readOnly?: boolean;
}) {
  const { config } = quiz;
  return (
    <section className="mt-8 space-y-8">
      {onRate && <RatingBar rating={rating ?? null} onRate={onRate} />}

      {/* Title */}
      <div>
        <Label>Quiz title</Label>
        <EditInput
          value={quiz.title}
          onChange={(v) => onEdit("title", (d) => (d.title = v))}
          className="text-2xl font-extrabold tracking-tight"
          readOnly={readOnly}
        />
        <p className="mt-1 px-2 font-mono text-[11px] text-[var(--muted)]">
          type: {config.type} · schema_version {config.schema_version}
        </p>
      </div>

      {/* Questions */}
      <div className="space-y-5">
        <Label>Questions ({config.questions.length})</Label>
        {config.questions.map((q, qi) => (
          <div key={q.id} className="rounded-2xl border border-[var(--hairline)] p-4">
            <EditInput
              value={q.text}
              onChange={(v) => onEdit(`questions.${qi}.text`, (d) => (d.config.questions[qi].text = v))}
              className="font-semibold"
              readOnly={readOnly}
            />
            <div className="mt-2 space-y-1">
              {q.options.map((o, oi) => (
                <div key={o.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--hairline)]" />
                  <EditInput
                    value={o.label}
                    onChange={(v) =>
                      onEdit(`questions.${qi}.options.${oi}.label`, (d) => (d.config.questions[qi].options[oi].label = v))
                    }
                    className="text-sm"
                    readOnly={readOnly}
                  />
                  <span className="shrink-0 font-mono text-[10px] text-[var(--muted)]">[{o.tags.join(", ")}]</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Outcomes */}
      <div className="space-y-5">
        <Label>Scored outcomes ({config.outcomes.length})</Label>
        {config.outcomes.map((out, oi) => (
          <div key={out.id} className="rounded-2xl border border-[var(--hairline)] p-4">
            <EditInput
              value={out.name}
              onChange={(v) => onEdit(`outcomes.${oi}.name`, (d) => (d.config.outcomes[oi].name = v))}
              className="text-lg font-bold"
              readOnly={readOnly}
            />
            <p className="px-2 font-mono text-[10px] text-[var(--muted)]">
              match: {out.match_logic.primary_tag} ≥ {out.match_logic.min_score}
            </p>
            <EditInput
              value={out.description}
              onChange={(v) => onEdit(`outcomes.${oi}.description`, (d) => (d.config.outcomes[oi].description = v))}
              className="mt-1 text-sm"
              multiline
              readOnly={readOnly}
            />
            <p className="mt-2 px-2 text-xs font-semibold text-[var(--muted)]">Recommends:</p>
            <div className="px-2 text-sm">{out.recommendations.join(" · ")}</div>
            {!readOnly && (
              <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center">
                <EditInput
                  value={out.cta.label}
                  onChange={(v) => onEdit(`outcomes.${oi}.cta.label`, (d) => (d.config.outcomes[oi].cta.label = v))}
                  className="text-sm font-semibold"
                />
                <EditInput
                  value={out.cta.url}
                  onChange={(v) => onEdit(`outcomes.${oi}.cta.url`, (d) => (d.config.outcomes[oi].cta.url = v))}
                  className="text-xs text-[var(--muted)]"
                />
              </div>
            )}
            {!readOnly && !out.cta.url && (
              <p className="px-2 text-[11px] text-amber-600">Add where this button should send people.</p>
            )}
          </div>
        ))}
      </div>

      {/* Email sequence — display-only preview (build spec §5.3) */}
      <div className="space-y-3">
        <Label>Follow-up sequence ({config.email_sequence.length} emails) · preview</Label>
        <p className="text-xs text-[var(--muted)]">We drafted a follow-up sequence. Copy it into your email tool.</p>
        {config.email_sequence.map((m, i) => (
          <div key={i} className="rounded-2xl border border-dashed border-[var(--hairline)] p-4 text-sm">
            <p className="font-mono text-[10px] text-[var(--muted)]">+{m.send_offset_hours}h</p>
            <p className="font-semibold">{m.subject}</p>
            <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">{m.body}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--signal)]">{m.cta}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RatingBar({
  rating,
  onRate,
}: {
  rating: OutputRating | null;
  onRate: (r: OutputRating) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-[var(--hairline)] px-4 py-2.5">
      <span className="text-xs text-[var(--muted)]">First impression?</span>
      {(["love_it", "not_quite"] as const).map((r) => {
        const selected = rating === r;
        return (
          <button
            key={r}
            onClick={() => onRate(r)}
            disabled={rating !== null}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              selected
                ? "bg-[var(--signal)] text-white"
                : "text-[var(--foreground)] hover:bg-[var(--signal)]/10 disabled:opacity-40"
            }`}
          >
            {r === "love_it" ? "Love it" : "Not quite"}
          </button>
        );
      })}
      {rating && <span className="text-xs text-emerald-600">Thanks, recorded.</span>}
    </div>
  );
}

export function EditInput({
  value,
  onChange,
  className = "",
  multiline = false,
  readOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  multiline?: boolean;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <div className={`px-2 py-1 ${multiline ? "whitespace-pre-wrap " : ""}${className}`}>{value}</div>
    );
  }
  const base =
    "w-full rounded-lg border border-transparent bg-transparent px-2 py-1 outline-none hover:border-[var(--hairline)] focus:border-[var(--signal)]";
  return multiline ? (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={2}
      className={`${base} resize-none ${className}`}
    />
  ) : (
    <input value={value} onChange={(e) => onChange(e.target.value)} className={`${base} ${className}`} />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
      {children}
    </p>
  );
}
