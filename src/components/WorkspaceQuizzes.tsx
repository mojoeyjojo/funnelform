"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// The quiz list for the Workspace, with a tiles/list view toggle on the header
// row. The owner's preference persists in localStorage. Data is fetched + RLS-
// scoped on the server (dashboard/page.tsx) and passed in already enriched with
// per-quiz lead counts, so this component is purely presentational + the toggle.

export type QuizCard = {
  id: string;
  title: string | null;
  status: string;
  slug: string | null;
  created_at: string;
  leads: number;
};

type View = "tiles" | "list";
const VIEW_KEY = "ff_quiz_view";

const BTN =
  "rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]";

export type LeadsMeter = { used: number; cap: number; atCap: boolean };

export default function WorkspaceQuizzes({
  quizzes,
  meter,
}: {
  quizzes: QuizCard[];
  meter: LeadsMeter | null;
}) {
  const [view, setView] = useState<View>("tiles");

  // Restore the saved preference after mount (localStorage is client-only, so
  // SSR renders the default and this corrects it — a brief, acceptable flicker
  // on an authed owner page).
  useEffect(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    // Apply the saved preference post-mount (not via a lazy initializer) so SSR
    // and first client render agree on the default and there's no hydration
    // mismatch on the toggle/layout.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "tiles" || saved === "list") setView(saved);
  }, []);

  function choose(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // private mode / quota — preference just won't persist, no big deal.
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Workspace</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/new"
            className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[var(--signal)]"
          >
            <span className="sm:hidden">+ New</span>
            <span className="hidden sm:inline">+ New quiz</span>
          </Link>
          {quizzes.length > 0 && (
            <div className="flex items-center gap-1 rounded-full border border-[var(--hairline)] p-1">
              <ToggleButton active={view === "tiles"} onClick={() => choose("tiles")} label="Tile view">
                <GridIcon />
              </ToggleButton>
              <ToggleButton active={view === "list"} onClick={() => choose("list")} label="List view">
                <ListIcon />
              </ToggleButton>
            </div>
          )}
        </div>
      </div>

      {meter && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
          {meter.used} / ~{meter.cap} leads this month
          {meter.atCap && (
            <>
              {" · "}
              <Link href="/pricing" className="text-[var(--signal)] underline underline-offset-4">
                upgrade for more
              </Link>
            </>
          )}
        </p>
      )}

      {quizzes.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-[var(--hairline)] p-6 text-sm text-[var(--muted)]">
          No quizzes yet. Generate one and save it. It’ll show up here.
        </p>
      ) : view === "tiles" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="flex flex-col justify-between gap-4 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-950/5"
            >
              <div>
                <p className="font-semibold">{q.title ?? "Untitled quiz"}</p>
                <Meta q={q} />
                <PublicLink q={q} />
              </div>
              <Actions q={q} />
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {quizzes.map((q) => (
            <li
              key={q.id}
              className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-950/5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold">{q.title ?? "Untitled quiz"}</p>
                <Meta q={q} />
                <PublicLink q={q} />
              </div>
              <Actions q={q} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Meta({ q }: { q: QuizCard }) {
  return (
    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
      {q.status} · {new Date(q.created_at).toLocaleDateString()} ·{" "}
      <span className="text-[var(--foreground)]">
        {q.leads} lead{q.leads === 1 ? "" : "s"}
      </span>
    </p>
  );
}

function PublicLink({ q }: { q: QuizCard }) {
  if (q.status !== "published" || !q.slug) return null;
  return (
    <a
      href={`/q/${q.slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 block break-all text-xs text-[var(--signal)] underline underline-offset-4"
    >
      /q/{q.slug}
    </a>
  );
}

function Actions({ q }: { q: QuizCard }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {q.status === "published" && (
        <Link href={`/analytics/${q.id}`} className={BTN}>
          Analytics
        </Link>
      )}
      {q.leads > 0 && (
        <Link href={`/leads/${q.id}`} className={BTN}>
          View leads
        </Link>
      )}
      <Link href={`/edit/${q.id}`} className={BTN}>
        Edit →
      </Link>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-[var(--foreground)] text-white"
          : "text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <rect x="1" y="2" width="14" height="2.5" rx="1.25" />
      <rect x="1" y="6.75" width="14" height="2.5" rx="1.25" />
      <rect x="1" y="11.5" width="14" height="2.5" rx="1.25" />
    </svg>
  );
}
