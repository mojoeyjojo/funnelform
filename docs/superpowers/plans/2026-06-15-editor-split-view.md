# Editor v2 — Split-View Live Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/edit/[id]` into a three-pane editor — structure sidebar, editor, and a live quiz-player preview — that updates as you type, on our light workspace design system, fully responsive and mobile-first.

**Architecture:** `EditQuizClient` becomes a full-height app shell (topbar + grid of three independently-scrolling panes) holding the same state it does today. The editor pane renders an extracted `QuizSettings` block plus the existing `QuizView` (with new section anchors). The preview pane renders `QuizPlayer` in a new `preview` mode, fed by the same in-memory `quiz` state. A `StructureNav` sidebar drives click-to-scroll + IntersectionObserver scroll-spy.

**Tech Stack:** Next.js (App Router), React client components, Tailwind v4 (CSS-first tokens in `globals.css`), TypeScript.

**Testing note:** No test framework exists in this repo. Verification per task = `npx tsc --noEmit`, `npx eslint <files>`, and (where UI) a manual check on the running dev server (`npm run dev`, http://localhost:3000). A dev server may already be running in the background.

**Design system reminder:** light workspace mode. Accent = `signal-600`. Use `--foreground`/`--muted`/`--hairline`, ink scale, emerald for "saved", `paper`/`mist` for the preview canvas, Tailwind `rounded-*`. NO dark theme. The player preview keeps the owner's `theme_accent`. Per the project rule: **no em dashes** anywhere (chat + product copy + comments).

---

## Task 1: Add `preview` mode to `QuizPlayer`

Foundational and isolated: lets the player render inside the editor without firing analytics or capturing leads, and without forcing full-screen height. Public behavior is unchanged when the prop is absent.

**Files:**
- Modify: `src/components/QuizPlayer.tsx`

- [ ] **Step 1: Add the `preview` prop to the component signature**

In the `QuizPlayer({ ... }: { ... })` props (currently ends with `accent: string | null;`), add `preview` to both the destructure and the type:

```tsx
export default function QuizPlayer({
  quizId,
  title,
  config,
  branding,
  placement,
  whatsapp,
  accent,
  preview = false,
}: {
  quizId: string;
  title: string;
  config: QuizConfig;
  branding: boolean;
  placement: "before_results" | "after_results";
  whatsapp: string | null;
  accent: string | null;
  preview?: boolean;
}) {
```

- [ ] **Step 2: Make `fireEvent` a no-op in preview**

At the very top of the `fireEvent` function body (before the `if (once)` block), add:

```tsx
  function fireEvent(
    event_type: string,
    question_id?: string,
    once?: string,
    outcome_id?: string,
  ) {
    if (preview) return; // editor preview must not pollute analytics
    if (once) {
```

- [ ] **Step 3: Make the outer container fit its frame in preview**

Replace the `<main ...>` opening tag's className with a conditional. Current:

```tsx
    <main
      className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6 sm:px-5 sm:py-12"
      style={{ "--accent": accentColor, "--accent-contrast": accentContrast } as React.CSSProperties}
    >
```

becomes:

```tsx
    <main
      className={
        preview
          ? "flex h-full w-full flex-col px-4 py-6"
          : "mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6 sm:px-5 sm:py-12"
      }
      style={{ "--accent": accentColor, "--accent-contrast": accentContrast } as React.CSSProperties}
    >
```

- [ ] **Step 4: Pass `preview` into `LeadForm` and skip the network call**

In the `phase === "lead"` render, add `preview={preview}`:

```tsx
        {phase === "lead" && (
          <LeadForm
            quizId={quizId}
            answers={answers}
            outcomeId={outcome?.id}
            sessionId={sessionId.current}
            preview={preview}
            onDone={() => setPhase("outcome")}
          />
        )}
```

Add `preview` to `LeadForm`'s props (signature currently ends with `onDone: () => void;`):

```tsx
function LeadForm({
  quizId,
  answers,
  outcomeId,
  sessionId,
  preview = false,
  onDone,
}: {
  quizId: string;
  answers: Record<string, string>;
  outcomeId?: string;
  sessionId: string;
  preview?: boolean;
  onDone: () => void;
}) {
```

In `submit`, after the four validation checks pass and before `setLoading(true)`, short-circuit preview:

```tsx
    if (!consent) {
      setError("Please tick the box to agree to be contacted, then try again.");
      return;
    }
    if (preview) {
      // Editor preview: show the result without creating a real lead.
      onDone();
      return;
    }
    setLoading(true);
```

- [ ] **Step 5: Make the branding badge inert in preview**

Replace the branding `<a ...>Made with Treeflow</a>` block. Current:

```tsx
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
```

becomes (badge text identical; in preview it is a non-navigating span):

```tsx
      {branding && (
        <footer className="mt-6 text-center">
          {preview ? (
            <span className="inline-block rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-signal-600 ring-1 ring-ink-950/5">
              Made with Treeflow
            </span>
          ) : (
            <a
              href="https://funnelform.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-semibold text-signal-600 ring-1 ring-ink-950/5 transition-colors hover:bg-white"
            >
              Made with Treeflow
            </a>
          )}
        </footer>
      )}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/QuizPlayer.tsx`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/QuizPlayer.tsx
git commit -m "Player: preview mode (no analytics, no lead POST, fits frame)"
```

---

## Task 2: Add section anchors to `QuizView`

Additive `id`s so the sidebar can scroll to sections and the scroll-spy can track them. Inert for the generate-flow and free-tool (`readOnly`) consumers.

**Files:**
- Modify: `src/components/QuizView.tsx`

- [ ] **Step 1: Anchor each question block**

Find the question map (`config.questions.map((q, qi) => (`). Add `id` + `data-nav-section` to the wrapper div:

```tsx
        {config.questions.map((q, qi) => (
          <div
            key={q.id}
            id={`sec-q-${qi}`}
            data-nav-section
            className="scroll-mt-6 rounded-2xl border border-[var(--hairline)] p-4"
          >
```

- [ ] **Step 2: Anchor each outcome block**

Find the outcome map (`config.outcomes.map((out, oi) => (`). Add the same:

```tsx
        {config.outcomes.map((out, oi) => (
          <div
            key={out.id}
            id={`sec-o-${oi}`}
            data-nav-section
            className="scroll-mt-6 rounded-2xl border border-[var(--hairline)] p-4"
          >
```

- [ ] **Step 3: Anchor the email sequence section**

Find the email section comment `{/* Email sequence — display-only preview ... */}` and its wrapping `<div className="space-y-3">`. Add the anchor:

```tsx
      <div id="sec-emails" data-nav-section className="scroll-mt-6 space-y-3">
        <Label>Follow-up sequence ({config.email_sequence.length} emails) · preview</Label>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/QuizView.tsx`
Expected: no output, exit 0.

Manual: the generate flow (`/`) and free tool still render unchanged (anchors are invisible).

- [ ] **Step 5: Commit**

```bash
git add src/components/QuizView.tsx
git commit -m "QuizView: section anchors for editor sidebar nav"
```

---

## Task 3: Extract `QuizSettings` from `EditQuizClient`

Move the WhatsApp / brand color / Treeflow badge / delete cards, the publish-result/validation banners, and the first-impression rating into a focused component, so the rebuilt shell stays lean. Pure move + prop-wiring; no behavior change.

**Files:**
- Create: `src/components/QuizSettings.tsx`
- Modify: `src/components/EditQuizClient.tsx` (will be fully rebuilt in Task 5; this task just relocates the JSX and helpers)

- [ ] **Step 1: Create `QuizSettings.tsx` with the moved UI**

The component receives the state values + handlers from `EditQuizClient`. Move the JSX from the current `EditQuizClient` (the WhatsApp card `src/components/EditQuizClient.tsx:337-350`, the branding card `:355-384`, the brand-color card `:388-416`, and the delete block `:426-461`) plus the `RatingBar` usage and `EmbedSnippet` (lines `:470-510`). Create:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import type { GeneratedQuiz } from "@/lib/schema";
import type { OutputRating } from "@/lib/types";

export function QuizSettings({
  quizTitle,
  whatsapp,
  branding,
  accent,
  hasPro,
  rating,
  onRate,
  onWhatsapp,
  onBranding,
  onAccent,
  onDelete,
}: {
  quizTitle: string;
  whatsapp: string;
  branding: boolean;
  accent: string | null;
  hasPro: boolean;
  rating?: OutputRating | null;
  onRate?: (r: OutputRating) => void;
  onWhatsapp: (v: string) => void;
  onBranding: (showBadge: boolean) => void;
  onAccent: (v: string | null) => void;
  onDelete: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div id="sec-settings" data-nav-section className="scroll-mt-6">
      {onRate && <RatingBar rating={rating ?? null} onRate={onRate} />}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-4 flex w-full items-center justify-between rounded-2xl border border-[var(--hairline)] bg-white px-4 py-3 text-left text-sm font-semibold transition-colors hover:border-ink-300"
        aria-expanded={open}
      >
        <span>Quiz settings</span>
        <span className="font-mono text-[11px] text-[var(--muted)]">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* WhatsApp delivery (build spec §5.6) */}
          <div className="rounded-2xl border border-[var(--hairline)] p-4">
            <p className="text-sm font-semibold">WhatsApp delivery (optional)</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Add your WhatsApp number and the results page shows a “Continue on WhatsApp”
              button, prefilled with the visitor’s result. Use international format.
            </p>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => onWhatsapp(e.target.value)}
              placeholder="+31 6 12345678"
              className="mt-3 w-full max-w-xs rounded-full border border-[var(--hairline)] px-4 py-2.5 text-sm outline-none focus:border-[var(--signal)]"
            />
          </div>

          {/* Treeflow branding (§5.9) */}
          <div className="rounded-2xl border border-[var(--hairline)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Treeflow branding</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {hasPro
                    ? "Hide the “Made with Treeflow” badge on your published quiz."
                    : "Removing the “Made with Treeflow” badge is a Pro feature."}
                </p>
              </div>
              {hasPro ? (
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={!branding}
                    onChange={(e) => onBranding(!e.target.checked)}
                    className="h-4 w-4 accent-[var(--signal)]"
                  />
                  Remove badge
                </label>
              ) : (
                <Link
                  href="/pricing"
                  className="shrink-0 rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
                >
                  Upgrade to Pro
                </Link>
              )}
            </div>
          </div>

          {/* Brand color (design-pass §2.4) */}
          <div className="rounded-2xl border border-[var(--hairline)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Brand color</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Sets the accent on your published quiz (progress, selected answers, and buttons).
                  Leave it on the default for a clean neutral look.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {accent && (
                  <button
                    type="button"
                    onClick={() => onAccent(null)}
                    className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--signal)]"
                  >
                    Reset
                  </button>
                )}
                <input
                  type="color"
                  value={accent ?? "#0a0a0a"}
                  onChange={(e) => onAccent(e.target.value)}
                  aria-label="Brand color"
                  className="h-9 w-9 cursor-pointer rounded-lg border border-[var(--hairline)] bg-transparent p-0.5"
                />
              </div>
            </div>
          </div>

          {/* Delete */}
          <div className="border-t border-[var(--hairline)] pt-4">
            {confirmDelete ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-rose-800">
                  Delete this quiz? It moves to Recently deleted for 30 days, then it&rsquo;s gone for
                  good. Your leads are kept until then.
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="rounded-full border border-[var(--hairline)] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:bg-ink-50 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await onDelete();
                      } finally {
                        setDeleting(false);
                      }
                    }}
                    disabled={deleting}
                    className="rounded-full bg-rose-600 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-rose-700 disabled:opacity-40"
                  >
                    {deleting ? "Deleting…" : "Delete quiz"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs font-semibold text-rose-700 underline underline-offset-4 transition-colors hover:text-rose-800"
              >
                Delete this quiz
              </button>
            )}
          </div>
        </div>
      )}
    </div>
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

// Embeddable iframe snippet (§5.4) — shown in the publish banner (Task 5).
export function EmbedSnippet({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const safeTitle = (title || "Quiz").replace(/"/g, "'");
  const snippet = `<iframe src="${url}" title="${safeTitle}" loading="lazy" style="width:100%;height:760px;border:0;border-radius:16px"></iframe>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — the field is selectable as a fallback
    }
  }

  return (
    <div className="mt-4 border-t border-emerald-200/70 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-emerald-800">Want it on your own site?</p>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-full border border-emerald-300 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-emerald-800 transition-colors hover:bg-emerald-100"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <p className="mt-1 text-xs text-emerald-700">
        Paste this where you want the quiz to appear. Works on WordPress, Webflow, Squarespace, Wix,
        and most site builders.
      </p>
      <textarea
        readOnly
        value={snippet}
        rows={3}
        onClick={(e) => e.currentTarget.select()}
        className="mt-2 w-full resize-none rounded-lg border border-emerald-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-ink-700 outline-none"
      />
    </div>
  );
}
```

Note: the `quizTitle` prop is accepted for future use by callers but `EmbedSnippet` takes `title` directly; keep `quizTitle` in the signature only if used, otherwise drop it to avoid an unused-var lint error. (It is NOT used in the body above, so DELETE the `quizTitle` line from both the destructure and the type before saving.)

- [ ] **Step 2: Verify the new file in isolation**

Run: `npx tsc --noEmit && npx eslint src/components/QuizSettings.tsx`
Expected: no output, exit 0. (At this point `EditQuizClient` still has its own copies; that is fine — Task 5 replaces it wholesale. If eslint flags the old `EmbedSnippet`/`RatingBar` as duplicate, ignore until Task 5.)

- [ ] **Step 3: Commit**

```bash
git add src/components/QuizSettings.tsx
git commit -m "Editor: extract QuizSettings (settings cards, rating, embed)"
```

---

## Task 4: Build `StructureNav` sidebar

**Files:**
- Create: `src/components/StructureNav.tsx`

- [ ] **Step 1: Create the component**

```tsx
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/StructureNav.tsx`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/StructureNav.tsx
git commit -m "Editor: StructureNav sidebar (sections + active state)"
```

---

## Task 5: Rebuild `EditQuizClient` as the three-pane shell

The big one. Replace the `return (...)` JSX (the `max-w-3xl` single column) with the app shell. Keep ALL existing state and the `recordRating`/`editField`/`editWhatsapp`/`editBranding`/`editAccent`/`regenerate`/`save`/`publish`/`unpublish`/`deleteQuiz` functions exactly as they are (lines `:46-244` of the current file). Remove the now-duplicated `RatingBar` and `EmbedSnippet` definitions at the bottom (they live in `QuizSettings.tsx` now).

**Files:**
- Modify: `src/components/EditQuizClient.tsx`
- Modify: `src/app/edit/[id]/page.tsx` (only if a global wrapper constrains width — verify in Step 6)

- [ ] **Step 1: Update imports**

At the top of `EditQuizClient.tsx`, replace the import block:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GeneratedQuiz, QuizConfig } from "@/lib/schema";
import type { OutputRating } from "@/lib/types";
import { QuizView } from "./QuizView";
import { QuizSettings, EmbedSnippet } from "./QuizSettings";
import { StructureNav } from "./StructureNav";
import QuizPlayer from "./QuizPlayer";
```

- [ ] **Step 2: Add shell-only UI state**

Immediately after the existing `const [deleting, setDeleting] = useState(false);` line (which can be removed since deletion state now lives in `QuizSettings`; keep `deleteQuiz` itself), add the new UI state near the other `useState`s:

```tsx
  // Shell UI state.
  const [activeId, setActiveId] = useState("sec-settings");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [previewKey, setPreviewKey] = useState(0); // bump to restart the preview
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
```

Note: `deleteQuiz` currently flips `setDeleting`; since `QuizSettings` owns its own deleting state, simplify `deleteQuiz` to drop the `setDeleting` calls:

```tsx
  async function deleteQuiz() {
    const res = await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/dashboard";
  }
```

And delete the now-unused `const [confirmDelete, setConfirmDelete] = useState(false);` and `const [deleting, setDeleting] = useState(false);` lines.

- [ ] **Step 3: Add the scroll-spy effect**

After the rating `useEffect`, add:

```tsx
  // Scroll-spy: highlight the sidebar item for the section nearest the top of
  // the editor pane. Re-observes when the question/outcome counts change.
  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-nav-section]"));
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActiveId(visible[0].target.id);
      },
      { root, rootMargin: "0px 0px -65% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [quiz.config.questions.length, quiz.config.outcomes.length]);

  function navigate(id: string) {
    const el = editorRef.current?.querySelector(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setDrawerOpen(false);
    if (mobileTab !== "edit") setMobileTab("edit");
  }
```

- [ ] **Step 4: Replace the entire `return (...)` with the shell**

Replace everything from `return (` to the final `);` of the component (the old `<main className="mx-auto max-w-3xl ...">` tree) with:

```tsx
  const playerUrl = slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/q/${slug}`
    : null;
  const showBanner =
    !bannerDismissed &&
    (publishState === "published" ||
      publishState === "blocked" ||
      publishState === "plan_blocked" ||
      publishState === "error");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper text-[var(--foreground)]">
      {/* Topbar */}
      <header className="z-20 flex h-14 flex-shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-white px-4 sm:px-5">
        <Link href="/dashboard" className="flex items-center gap-2 pr-3 sm:border-r sm:border-[var(--hairline)] sm:pr-4">
          <span className="text-base font-extrabold tracking-tight">Treeflow</span>
        </Link>
        <div className="hidden min-w-0 flex-1 items-center gap-1.5 sm:flex">
          <Link href="/dashboard" className="text-[13px] font-medium text-[var(--muted)] hover:text-[var(--foreground)]">
            My quizzes
          </Link>
          <span className="text-[13px] text-ink-300">/</span>
          <span className="truncate text-[13px] font-semibold">{quiz.title || "Untitled quiz"}</span>
        </div>

        {/* Structure trigger (below xl) */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="ml-auto rounded-lg border border-[var(--hairline)] px-3 py-1.5 text-xs font-semibold transition-colors hover:border-ink-300 xl:hidden"
        >
          Structure
        </button>

        {/* Mobile Edit | Preview toggle (below md) */}
        <div className="flex rounded-full border border-[var(--hairline)] p-0.5 md:hidden">
          {(["edit", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMobileTab(t)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                mobileTab === t ? "bg-[var(--signal)] text-white" : "text-[var(--muted)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 md:ml-3">
          <SaveStatus state={state} />
          <button
            onClick={save}
            disabled={state === "saving" || state === "clean" || state === "saved"}
            className="hidden rounded-full border border-[var(--hairline)] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.08em] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)] disabled:opacity-40 sm:block"
          >
            {state === "saving" ? "Saving…" : "Save"}
          </button>
          {(publishState === "published" || publishState === "unpublishing") && (
            <button
              onClick={unpublish}
              disabled={publishState === "unpublishing"}
              className="hidden rounded-full border border-[var(--hairline)] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.08em] transition-colors hover:border-rose-300 hover:text-rose-700 disabled:opacity-40 lg:block"
            >
              {publishState === "unpublishing" ? "Offline…" : "Unpublish"}
            </button>
          )}
          <button
            onClick={publish}
            disabled={publishState === "publishing" || publishState === "unpublishing"}
            className="rounded-full bg-[var(--signal)] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-white transition-colors hover:brightness-110 disabled:opacity-40"
          >
            {publishState === "publishing"
              ? "Publishing…"
              : publishState === "published"
                ? "Re-publish"
                : "Publish →"}
          </button>
        </div>
      </header>

      {/* Publish banner strip */}
      {showBanner && (
        <PublishBanner
          publishState={publishState}
          playerUrl={playerUrl}
          quizTitle={quiz.title}
          blockedOutcomes={blockedOutcomes}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      {/* Workspace */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar — persistent at xl */}
        <aside className="hidden w-[280px] flex-shrink-0 border-r border-[var(--hairline)] bg-white xl:block">
          <StructureNav quiz={quiz} activeId={activeId} onNavigate={navigate} />
        </aside>

        {/* Sidebar drawer — below xl */}
        {drawerOpen && (
          <div className="fixed inset-0 z-30 xl:hidden">
            <div className="absolute inset-0 bg-ink-950/30" onClick={() => setDrawerOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-[280px] border-r border-[var(--hairline)] bg-white shadow-xl">
              <StructureNav quiz={quiz} activeId={activeId} onNavigate={navigate} />
            </div>
          </div>
        )}

        {/* Editor pane */}
        <main
          ref={editorRef}
          className={`min-h-0 flex-1 overflow-y-auto bg-white px-5 py-8 sm:px-8 ${
            mobileTab === "edit" ? "block" : "hidden"
          } md:block md:border-r md:border-[var(--hairline)]`}
        >
          <div className="mx-auto max-w-2xl">
            <QuizSettings
              whatsapp={whatsapp}
              branding={branding}
              accent={accent}
              hasPro={hasPro}
              rating={ratingSession ? rating : undefined}
              onRate={ratingSession ? recordRating : undefined}
              onWhatsapp={editWhatsapp}
              onBranding={editBranding}
              onAccent={editAccent}
              onDelete={deleteQuiz}
            />
            <div className="mt-8">
              <QuizView quiz={quiz} onEdit={editField} onRegenerate={regenerate} />
            </div>
          </div>
        </main>

        {/* Preview pane */}
        <section
          className={`min-h-0 flex-1 overflow-y-auto bg-mist ${
            mobileTab === "preview" ? "flex" : "hidden"
          } flex-col items-center md:flex`}
        >
          <div className="flex w-full items-center justify-between px-5 pt-5 md:px-6">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
              Live preview
            </span>
            <button
              type="button"
              onClick={() => setPreviewKey((k) => k + 1)}
              className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              ↻ Restart
            </button>
          </div>
          {/* Phone frame on md+, full-bleed on mobile */}
          <div className="flex w-full flex-1 justify-center px-0 py-4 md:px-6 md:py-8">
            <div className="w-full md:max-w-[360px] md:overflow-hidden md:rounded-[32px] md:bg-white md:shadow-float md:ring-1 md:ring-ink-950/5">
              <QuizPlayer
                key={previewKey}
                preview
                quizId={id}
                title={quiz.title}
                config={quiz.config}
                branding={branding}
                placement="before_results"
                whatsapp={whatsapp || null}
                accent={accent}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
```

- [ ] **Step 5: Add the `SaveStatus` and `PublishBanner` helpers and remove old duplicates**

At the bottom of the file, DELETE the old `RatingBar` (if present) and `EmbedSnippet` function definitions, and add:

```tsx
function SaveStatus({ state }: { state: SaveState }) {
  if (state === "saved")
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Saved
      </span>
    );
  if (state === "dirty")
    return <span className="hidden text-[11px] font-medium text-[var(--muted)] sm:inline">Unsaved</span>;
  if (state === "error")
    return <span className="text-[11px] font-semibold text-rose-700">Save failed</span>;
  return null;
}

function PublishBanner({
  publishState,
  playerUrl,
  quizTitle,
  blockedOutcomes,
  onDismiss,
}: {
  publishState: PublishState;
  playerUrl: string | null;
  quizTitle: string;
  blockedOutcomes: string[];
  onDismiss: () => void;
}) {
  return (
    <div className="relative z-10 flex-shrink-0 border-b border-[var(--hairline)]">
      {publishState === "published" && playerUrl && (
        <div className="bg-emerald-50 px-5 py-4 sm:px-8">
          <div className="mx-auto flex max-w-3xl items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-800">Your quiz is live.</p>
              <a
                href={playerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block break-all text-sm text-[var(--signal)] underline underline-offset-4"
              >
                {playerUrl}
              </a>
              <EmbedSnippet url={playerUrl} title={quizTitle} />
            </div>
            <button onClick={onDismiss} className="shrink-0 text-xs font-semibold text-emerald-700 underline">
              Dismiss
            </button>
          </div>
        </div>
      )}
      {publishState === "blocked" && (
        <div className="bg-amber-50 px-5 py-4 text-sm text-amber-800 sm:px-8">
          <p className="font-semibold">Check your button links.</p>
          <p className="mt-1">
            A button link is optional, but if you add one it has to be a full web address. Please fix:{" "}
            <strong>{blockedOutcomes.join(", ")}</strong>. Use a full URL like
            https://calendly.com/you/intro-call, save, and publish again.
          </p>
        </div>
      )}
      {publishState === "plan_blocked" && (
        <div className="bg-amber-50 px-5 py-4 text-sm text-amber-800 sm:px-8">
          <p className="font-semibold">The free plan includes one live quiz.</p>
          <p className="mt-1">
            You already have a quiz live. Upgrade to Pro to publish as many as you like, or unpublish
            the other one first.
          </p>
          <Link
            href="/pricing"
            className="mt-3 inline-block rounded-full bg-[var(--signal)] px-5 py-2 text-xs font-bold uppercase tracking-[0.1em] text-white"
          >
            See Pro →
          </Link>
        </div>
      )}
      {publishState === "error" && (
        <p className="bg-rose-50 px-5 py-4 text-sm text-rose-700 sm:px-8">
          Couldn’t publish just now. Please try again.
        </p>
      )}
    </div>
  );
}
```

Note: reset `bannerDismissed` to `false` whenever a new publish result arrives. In `publish()` and `unpublish()`, add `setBannerDismissed(false);` right after the function's first line so a fresh result always shows.

- [ ] **Step 6: Check the route wrapper**

Run: `grep -rn "max-w\|<main\|container" src/app/edit/[id]/page.tsx src/app/layout.tsx`
The editor shell uses `h-screen`. Confirm no parent adds padding/max-width that would break full-bleed. If `src/app/layout.tsx` wraps children in a constrained container, the editor route is fine because the shell is `h-screen` fixed; if a global `<body>` padding exists, note it but do not change global layout without confirming. Expected: `page.tsx` renders `<EditQuizClient />` + `<AuthOverlay />` with no width wrapper (verified in spec).

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx eslint src/components/EditQuizClient.tsx`
Expected: no output, exit 0.

Run: `npm run build 2>&1 | tail -5`
Expected: `✓ Compiled successfully`, `/edit/[id]` present in route list.

- [ ] **Step 8: Manual check (dev server)**

With `npm run dev` running, open an existing quiz at `/edit/<id>` (sign in first). Verify on desktop ≥1280px:
- three panes visible; topbar shows breadcrumb + Save + Publish + Saved pill;
- typing in a question/outcome field updates the phone preview live;
- clicking a sidebar item scrolls the editor to that section and highlights it;
- scrolling the editor updates the active sidebar item;
- the preview never creates a network call to `/api/quiz-events` or `/api/leads` (check Network tab while clicking through the preview);
- ↻ Restart returns the preview to the welcome screen.

- [ ] **Step 9: Commit**

```bash
git add src/components/EditQuizClient.tsx src/app/edit/[id]/page.tsx
git commit -m "Editor: three-pane shell with live player preview + scroll-spy nav"
```

---

## Task 6: Responsive polish + final verification

**Files:**
- Modify: `src/components/EditQuizClient.tsx` (only if manual checks below reveal issues)

- [ ] **Step 1: Manual check — tablet (768–1279px)**

Resize to ~1000px. Expected: two panes (editor | preview), no persistent sidebar, "Structure" button in topbar opens a left drawer overlay that closes on backdrop click or after navigating. Save/Publish visible.

- [ ] **Step 2: Manual check — mobile (<768px)**

Resize to ~390px. Expected: single column; `Edit | Preview` toggle in topbar swaps between the editor and a full-width player (no phone frame); "Structure" opens the drawer; the breadcrumb hides, "Save" hides (Publish stays); navigating from the drawer switches to the Edit tab and scrolls.

- [ ] **Step 3: Fix any issues found**

If a pane shows when it should not, re-check the visibility classes: editor pane `${mobileTab === "edit" ? "block" : "hidden"} md:block`, preview pane `${mobileTab === "preview" ? "flex" : "hidden"} md:flex`, sidebar `hidden xl:block`, drawer `xl:hidden`, mobile toggle `md:hidden`, Structure button `xl:hidden`. Adjust only the offending class.

- [ ] **Step 4: Em-dash + token sweep**

Run: `grep -rn "—" src/components/EditQuizClient.tsx src/components/QuizSettings.tsx src/components/StructureNav.tsx`
Expected: matches only inside the moved comments are acceptable to the same standard as the rest of the file; restructure any in product copy. (The moved copy used no em dashes; confirm none were introduced.)

- [ ] **Step 5: Full verification**

Run: `npx tsc --noEmit && npx eslint src/components/EditQuizClient.tsx src/components/QuizSettings.tsx src/components/StructureNav.tsx src/components/QuizView.tsx src/components/QuizPlayer.tsx && npm run build 2>&1 | tail -5`
Expected: clean tsc, clean eslint, successful build.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Editor: responsive polish (tablet drawer, mobile Edit/Preview toggle)"
```

---

## Self-review notes

- **Spec coverage:** topbar/breadcrumb/Saved pill (Task 5), banners moved (Task 5), three panes (Task 5), StructureNav + scroll-spy (Tasks 4, 5), QuizSettings collapsible at top (Task 3, 5), QuizView anchors (Task 2), QuizPlayer preview mode incl. no analytics / no lead POST / fit frame / inert badge (Task 1), live data flow + Restart (Task 5), color translation (applied throughout; signal-600 accent, paper/mist canvas, emerald saved), responsive breakpoints (Tasks 5, 6). Non-goals respected: no add/remove/reorder, email display-only, explicit Save.
- **Type consistency:** section id scheme `sec-settings | sec-q-N | sec-o-N | sec-emails` is identical in `QuizView`, `QuizSettings`, and `buildNavGroups`. `SaveState`/`PublishState` types already exist in `EditQuizClient`. `QuizPlayer` `preview` prop matches across player + `LeadForm`.
- **Known follow-ups (not in scope):** if structural editing (add/remove questions) is added later, clamp `qIndex` in `QuizPlayer`.
