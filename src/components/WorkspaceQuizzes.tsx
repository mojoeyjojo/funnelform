"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

export type LeadsMeter = { used: number; cap: number; atCap: boolean };

export default function WorkspaceQuizzes({
  quizzes,
  meter,
  deletedCount,
}: {
  quizzes: QuizCard[];
  meter: LeadsMeter | null;
  deletedCount: number;
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

      {deletedCount > 0 && (
        <Link
          href="/deleted"
          className="mt-3 inline-block text-xs font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--signal)]"
        >
          Recently deleted ({deletedCount})
        </Link>
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
              className="flex items-start justify-between gap-2 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-950/5"
            >
              <div className="min-w-0">
                <p className="font-semibold">{q.title ?? "Untitled quiz"}</p>
                <Meta q={q} />
                <PublicLink q={q} />
              </div>
              <QuizActionsMenu q={q} />
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {quizzes.map((q) => (
            <li
              key={q.id}
              className="flex items-start justify-between gap-2 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-950/5"
            >
              <div className="min-w-0">
                <p className="font-semibold">{q.title ?? "Untitled quiz"}</p>
                <Meta q={q} />
                <PublicLink q={q} />
              </div>
              <QuizActionsMenu q={q} />
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

// Per-quiz actions, collapsed into a "..." kebab popup (room to grow as we add
// more actions). Delete is a two-step confirm inside the menu, then a soft-
// delete request + a server refresh so the card drops out of the list.
function QuizActionsMenu({ q }: { q: QuizCard }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
      setConfirming(false);
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function del() {
    setBusy(true);
    try {
      const res = await fetch(`/api/quizzes/${q.id}`, { method: "DELETE" });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setBusy(false);
      }
    } catch {
      setBusy(false);
    }
  }

  const item =
    "block w-full rounded-lg px-3 py-2 text-left text-sm text-ink-700 transition-colors hover:bg-ink-50";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Quiz actions"
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-ink-100 hover:text-[var(--foreground)]"
      >
        <DotsIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-52 max-w-[calc(100vw-2rem)] origin-top-right rounded-2xl border border-[var(--hairline)] bg-white p-2 shadow-float"
        >
          {confirming ? (
            <div className="p-1">
              <p className="px-2 py-1 text-xs leading-relaxed text-ink-600">
                Delete this quiz? It moves to Recently deleted for 30 days, then it&rsquo;s gone for
                good. Leads are kept until then.
              </p>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="flex-1 rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-ink-50 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={del}
                  disabled={busy}
                  className="flex-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-40"
                >
                  {busy ? "…" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {q.status === "published" && (
                <Link href={`/analytics/${q.id}`} role="menuitem" className={item}>
                  Analytics
                </Link>
              )}
              {q.leads > 0 && (
                <Link href={`/leads/${q.id}`} role="menuitem" className={item}>
                  View leads
                </Link>
              )}
              <Link href={`/edit/${q.id}`} role="menuitem" className={item}>
                Edit
              </Link>
              <div className="my-1 h-px bg-[var(--hairline)]" />
              <button
                type="button"
                role="menuitem"
                onClick={() => setConfirming(true)}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 transition-colors hover:bg-rose-50"
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <circle cx="9" cy="3.5" r="1.6" />
      <circle cx="9" cy="9" r="1.6" />
      <circle cx="9" cy="14.5" r="1.6" />
    </svg>
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
