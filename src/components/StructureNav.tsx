"use client";

import type { GeneratedQuiz } from "@/lib/schema";

export type NavItem = { id: string; label: string; num?: string };

// Build the nav model from the quiz. Section ids match the anchors in
// QuizView / QuizSettings / the editor shell (sec-share, sec-settings, sec-q-N,
// sec-o-N, sec-emails). `published` adds the Share item only once a quiz is live.
export function buildNavGroups(
  quiz: GeneratedQuiz,
  published: boolean,
): { title: string; items: NavItem[] }[] {
  const overview: NavItem[] = [{ id: "sec-settings", label: "Quiz title & settings" }];
  if (published) overview.unshift({ id: "sec-share", label: "Share & publish" });

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
    { title: "Overview", items: overview },
    { title: "Questions", items: questions },
    { title: "Outcomes", items: outcomes },
    {
      title: "Follow-ups",
      items: [{ id: "sec-emails", label: `Email sequence (${quiz.config.email_sequence.length})` }],
    },
  ];
}

export function StructureNav({
  quiz,
  activeId,
  onNavigate,
  published = false,
}: {
  quiz: GeneratedQuiz;
  activeId: string;
  onNavigate: (id: string) => void;
  published?: boolean;
}) {
  const groups = buildNavGroups(quiz, published);
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
            <p className="px-2 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--e-text-faint)]">
              {g.title}
            </p>
            {g.items.map((it) => {
              const active = it.id === activeId;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onNavigate(it.id)}
                  className={`mb-0.5 flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition-colors ${
                    active
                      ? "bg-[var(--e-accent-glow)] font-semibold text-[var(--signal)]"
                      : "font-medium text-[var(--e-text-2)] hover:bg-[var(--e-surface-3)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {it.num ? (
                    <span
                      className={`w-[18px] flex-shrink-0 font-mono text-[10px] font-bold ${
                        active ? "text-[var(--signal)]" : "text-[var(--e-text-faint)]"
                      }`}
                    >
                      {it.num}
                    </span>
                  ) : (
                    <span
                      className={`h-[5px] w-[5px] flex-shrink-0 rounded-full ${
                        active ? "bg-[var(--signal)]" : "bg-black/15"
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
