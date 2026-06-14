"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Top-bar account avatar + popup. The circle lives in the bar; everything else
// (email, plan + upgrade, sign out / sign in) lives in the dropdown. Guests get
// the same affordance, with "Create free account" in place of plan + sign out.
// All inputs are resolved server-side (dashboard/page.tsx) and passed as props.

export default function AccountMenu({
  email,
  isGuest,
  isPaid,
  planLabel,
}: {
  email: string | null;
  isGuest: boolean;
  isPaid: boolean;
  planLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape (only wired while open).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const initial = (email?.trim()?.[0] ?? "").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-sm font-bold text-ink-700 ring-1 ring-ink-950/5 transition-colors hover:bg-ink-200 active:scale-[0.97]"
      >
        {isGuest || !initial ? <PersonIcon /> : initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 max-w-[calc(100vw-2rem)] origin-top-right rounded-2xl border border-[var(--hairline)] bg-white p-2 shadow-float"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-ink-950">
              {isGuest ? "Guest session" : email}
            </p>
            {isGuest && (
              <p className="mt-0.5 text-xs text-[var(--muted)]">Saved to this browser only.</p>
            )}
          </div>

          <div className="my-1 h-px bg-[var(--hairline)]" />

          {isGuest ? (
            <Link
              href="/login?next=/dashboard"
              role="menuitem"
              className="block rounded-lg bg-[var(--foreground)] px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[var(--signal)]"
            >
              Create free account →
            </Link>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-sm text-ink-700">Plan</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${
                    isPaid ? "bg-signal-600/10 text-signal-600" : "bg-ink-100 text-ink-600"
                  }`}
                >
                  {planLabel}
                </span>
              </div>

              {isPaid ? (
                <form action="/api/stripe/portal" method="post">
                  <button
                    type="submit"
                    role="menuitem"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-700 transition-colors hover:bg-ink-50"
                  >
                    Manage billing
                  </button>
                </form>
              ) : (
                <Link
                  href="/pricing"
                  role="menuitem"
                  className="mt-1 block rounded-lg bg-signal-600 px-3 py-2 text-center text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-signal-500"
                >
                  Upgrade
                </Link>
              )}

              <div className="my-1 h-px bg-[var(--hairline)]" />

              <Link
                href="/auth/reset"
                role="menuitem"
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink-700 transition-colors hover:bg-ink-50"
              >
                Change password
              </Link>

              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  role="menuitem"
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-700 transition-colors hover:bg-ink-50"
                >
                  Sign out
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="8" cy="5" r="3" />
      <path d="M2.5 13.5c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5v.5h-11v-.5z" />
    </svg>
  );
}
