"use client";

import type { GeneratedQuiz } from "@/lib/schema";

export type NavItem = { id: string; label: string; num?: string };

// Build the nav model from the quiz. Section ids match the anchors added in
// QuizView / QuizSettings (sec-settings, sec-q-N, sec-o-N, sec-emails).
export function buildNavGroups(quiz: GeneratedQuiz): { title: string; items: NavItem[] }[] {
  const questions = quiz.config.questions.map((q, i) => ({
    id: `sec-q-${i}`,
    num: `Q${i + 1}`,
    label: q.text || `Question ${i + 1}`,
  }));
  const outcomes = quiz.config.outcomes.map((o, i) => ({
    id: `sec-o-${i}`,
    label: o.name || `Outcome ${i + 1}`,
  }));
  return [
    { title: "Overview", items: [{ id: "sec-settings", label: "Quiz title & settings" }] },
    { title: "Questions", items: questions },
    { title: "Outcomes", items: outcomes },
    {
      title: "Follow-ups",
      items: [
        {
          id: "sec-emails",
          label: `Email sequence (${quiz.config.email_sequence.length})`,
        },
      ],
    },
  ];
}

export function StructureNav({
  quiz,
  activeId,
  onNavigate,
}: {
  quiz: GeneratedQuiz;
  activeId: string;
  onNavigate: (id: string) => void;
}) {
  const groups = buildNavGroups(quiz);
  return (
    <nav className="flex h-full flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-[var(--hairline)] px-5 py-4">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
          Quiz structure
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {groups.map((g) => (
          <div key={g.title} className="mb-6">
            <p className="px-2 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink-300">
              {g.title}
            </p>
            {g.items.map((it) => {
              const active = it.id === activeId;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onNavigate(it.id)}
                  className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors ${
                    active
                      ? "bg-[var(--signal)]/10 font-semibold text-[var(--signal)]"
                      : "font-medium text-[var(--muted)] hover:bg-ink-50 hover:text-[var(--foreground)]"
                  }`}
                >
                  {it.num ? (
                    <span
                      className={`w-5 flex-shrink-0 font-mono text-[10px] font-bold ${
                        active ? "text-[var(--signal)]" : "text-ink-300"
                      }`}
                    >
                      {it.num}
                    </span>
                  ) : (
                    <span
                      className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                        active ? "bg-[var(--signal)]" : "bg-[var(--hairline)]"
                      }`}
                    />
                  )}
                  <span className="truncate">{it.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
