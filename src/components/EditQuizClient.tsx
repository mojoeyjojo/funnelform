"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GeneratedQuiz, QuizConfig } from "@/lib/schema";
import type { OutputRating } from "@/lib/types";
import { QuizView } from "./QuizView";

type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";
type PublishState =
  | "idle"
  | "publishing"
  | "published"
  | "unpublishing"
  | "blocked"
  | "plan_blocked"
  | "error";

// Saved-quiz editor. Persistence is an explicit Save (PATCH) — not
// per-keystroke autosave — per the build plan. Just-generated quizzes arrive
// with ?new=1&sid=<session> and show the one-tap first-impression rating
// (output_rating instrumentation, moved here from the landing page).
export default function EditQuizClient({
  id,
  initialTitle,
  initialConfig,
  initialStatus,
  initialSlug,
  initialWhatsapp,
  initialBranding,
  initialAccent,
  hasPro,
  isGuest,
}: {
  id: string;
  initialTitle: string;
  initialConfig: QuizConfig;
  initialStatus: string;
  initialSlug: string | null;
  initialWhatsapp: string;
  initialBranding: boolean;
  initialAccent: string | null;
  hasPro: boolean;
  isGuest: boolean;
}) {
  const [quiz, setQuiz] = useState<GeneratedQuiz>({ title: initialTitle, config: initialConfig });
  const [whatsapp, setWhatsapp] = useState(initialWhatsapp);
  const [branding, setBranding] = useState(initialBranding);
  const [accent, setAccent] = useState<string | null>(initialAccent);
  const [state, setState] = useState<SaveState>("clean");
  const [publishState, setPublishState] = useState<PublishState>(
    initialStatus === "published" ? "published" : "idle",
  );
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [blockedOutcomes, setBlockedOutcomes] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // First-impression rating, only for just-generated quizzes (?new=1).
  const [ratingSession, setRatingSession] = useState<string | null>(null);
  const [rating, setRating] = useState<OutputRating | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") setRatingSession(params.get("sid") ?? "unknown");
  }, []);

  async function recordRating(r: OutputRating) {
    if (rating) return;
    setRating(r);
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: ratingSession ?? "unknown",
          eventType: "output_rating",
          metadata: { rating: r },
        }),
      });
    } catch {
      // instrumentation must never block the UI
    }
  }

  function editField(path: string, mutate: (draft: GeneratedQuiz) => void) {
    setQuiz((prev) => {
      const draft: GeneratedQuiz = structuredClone(prev);
      mutate(draft);
      return draft;
    });
    setState("dirty");
  }

  function editWhatsapp(value: string) {
    setWhatsapp(value);
    setState("dirty");
  }

  function editBranding(showBadge: boolean) {
    setBranding(showBadge);
    setState("dirty");
  }

  function editAccent(value: string | null) {
    setAccent(value);
    setState("dirty");
  }

  async function save(): Promise<boolean> {
    setState("saving");
    try {
      const res = await fetch(`/api/quizzes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quiz.title,
          config: quiz.config,
          whatsapp,
          theme_accent: accent,
          // Only Pro can flip this; free accounts never send it, so a save
          // can't 403 on the branding gate.
          ...(hasPro ? { branding_enabled: branding } : {}),
        }),
      });
      setState(res.ok ? "saved" : "error");
      return res.ok;
    } catch {
      setState("error");
      return false;
    }
  }

  // Save any pending edits first (the publish gate validates the SAVED config),
  // then publish. Surfaces the CTA-URL validation block inline.
  async function publish() {
    // Defense in depth: the edit page already walls guests behind the signup
    // overlay, but if state is stale, route them to convert anyway.
    if (isGuest) {
      window.location.href = "/login?next=" + encodeURIComponent(`/edit/${id}`);
      return;
    }
    setPublishState("publishing");
    setBlockedOutcomes([]);
    if (state === "dirty" || state === "error") {
      const ok = await save();
      if (!ok) {
        setPublishState("error");
        return;
      }
    }
    try {
      const res = await fetch(`/api/quizzes/${id}/publish`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSlug(data.slug);
        setPublishState("published");
      } else if (data.reason === "guest") {
        // Server-side guest gate (in case the client state was stale).
        window.location.href = "/login?next=" + encodeURIComponent(`/edit/${id}`);
      } else if (data.reason === "invalid_cta_url") {
        setBlockedOutcomes((data.outcomes ?? []).map((o: { name: string }) => o.name));
        setPublishState("blocked");
      } else if (data.reason === "plan_limit") {
        // Free plan: one live quiz. Upgrade prompt instead of a dead end.
        setPublishState("plan_blocked");
      } else {
        setPublishState("error");
      }
    } catch {
      setPublishState("error");
    }
  }

  // Take a live quiz offline. Fully reversible: the slug, leads, and analytics
  // are kept, so re-publishing restores the same public URL. Frees the free
  // plan's one-live-quiz slot so a different quiz can go live.
  async function unpublish() {
    setPublishState("unpublishing");
    try {
      const res = await fetch(`/api/quizzes/${id}/publish`, { method: "DELETE" });
      setPublishState(res.ok ? "idle" : "error");
    } catch {
      setPublishState("error");
    }
  }

  // Soft delete: the quiz moves to Recently deleted (30-day grace) and the owner
  // lands back in the workspace. Reversible from /deleted until the purge cron.
  async function deleteQuiz() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
      if (res.ok) {
        window.location.href = "/dashboard";
      } else {
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  }

  const playerUrl = slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/q/${slug}` : null;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/dashboard"
          className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--signal)]"
        >
          ← Workspace
        </Link>
        <div className="flex items-center gap-3">
          {state === "saved" && <span className="text-xs text-emerald-600">Saved.</span>}
          {state === "dirty" && <span className="text-xs text-[var(--muted)]">Unsaved changes</span>}
          {state === "error" && <span className="text-xs text-rose-700">Save failed</span>}
          <button
            onClick={save}
            disabled={state === "saving" || state === "clean" || state === "saved"}
            className="rounded-full border border-[var(--hairline)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)] disabled:opacity-40"
          >
            {state === "saving" ? "Saving…" : "Save changes"}
          </button>
          {(publishState === "published" || publishState === "unpublishing") && (
            <button
              onClick={unpublish}
              disabled={publishState === "unpublishing"}
              className="rounded-full border border-[var(--hairline)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:border-rose-300 hover:text-rose-700 disabled:opacity-40"
            >
              {publishState === "unpublishing" ? "Taking offline…" : "Unpublish"}
            </button>
          )}
          <button
            onClick={publish}
            disabled={publishState === "publishing" || publishState === "unpublishing"}
            className="rounded-full bg-[var(--foreground)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[var(--signal)] disabled:opacity-40"
          >
            {publishState === "publishing"
              ? "Publishing…"
              : publishState === "published"
                ? "Re-publish"
                : "Publish →"}
          </button>
        </div>
      </header>

      {/* Publish result / validation block */}
      {publishState === "published" && playerUrl && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">Your quiz is live.</p>
          <a
            href={playerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block break-all text-sm text-[var(--signal)] underline underline-offset-4"
          >
            {playerUrl}
          </a>
        </div>
      )}
      {publishState === "blocked" && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Check your button links.</p>
          <p className="mt-1">
            A button link is optional, but if you add one it has to be a full web
            address. Please fix: <strong>{blockedOutcomes.join(", ")}</strong>. Use a
            full URL like https://calendly.com/you/intro-call, save, and publish again.
          </p>
        </div>
      )}
      {publishState === "plan_blocked" && (
        <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">The free plan includes one live quiz.</p>
          <p className="mt-1">
            You already have a quiz live. Upgrade to Pro to publish as many as you like, or
            unpublish the other one first.
          </p>
          <Link
            href="/pricing"
            className="mt-3 inline-block rounded-full bg-ink-950 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white transition-all hover:bg-signal-600 active:scale-[0.98]"
          >
            See Pro →
          </Link>
        </div>
      )}
      {publishState === "error" && (
        <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Couldn’t publish just now. Please try again.
        </p>
      )}

      {/* WhatsApp delivery — adds a "Continue on WhatsApp" button to results
          (build spec §5.6, the EU/LATAM wedge). Optional, per quiz. */}
      <div className="mb-8 rounded-2xl border border-[var(--hairline)] p-4">
        <p className="text-sm font-semibold">WhatsApp delivery (optional)</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Add your WhatsApp number and the results page shows a “Continue on WhatsApp”
          button, prefilled with the visitor’s result. Use international format.
        </p>
        <input
          type="tel"
          value={whatsapp}
          onChange={(e) => editWhatsapp(e.target.value)}
          placeholder="+31 6 12345678"
          className="mt-3 w-full max-w-xs rounded-full border border-[var(--hairline)] px-4 py-2.5 text-sm outline-none focus:border-[var(--signal)]"
        />
      </div>

      {/* Branding (§5.9): removing the "Made with Treeflow" badge is Pro.
          The player enforces the watermark server-side for free owners, so
          this card is honest UI, not the security boundary. */}
      <div className="mb-8 rounded-2xl border border-[var(--hairline)] p-4">
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
                onChange={(e) => editBranding(!e.target.checked)}
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

      {/* Brand color (design-pass §2.4): the accent applied to the published
          player. Optional — null renders the neutral ink default. */}
      <div className="mb-8 rounded-2xl border border-[var(--hairline)] p-4">
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
                onClick={() => editAccent(null)}
                className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--signal)]"
              >
                Reset
              </button>
            )}
            <input
              type="color"
              value={accent ?? "#0a0a0a"}
              onChange={(e) => editAccent(e.target.value)}
              aria-label="Brand color"
              className="h-9 w-9 cursor-pointer rounded-lg border border-[var(--hairline)] bg-transparent p-0.5"
            />
          </div>
        </div>
      </div>

      <QuizView
        quiz={quiz}
        onEdit={editField}
        rating={ratingSession ? rating : undefined}
        onRate={ratingSession ? recordRating : undefined}
      />

      <div className="mt-12 border-t border-[var(--hairline)] pt-6">
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
                onClick={deleteQuiz}
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
    </main>
  );
}
