"use client";

import { useState } from "react";
import Link from "next/link";
import type { GeneratedQuiz, QuizConfig } from "@/lib/schema";
import { QuizView } from "./QuizView";

type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";
type PublishState = "idle" | "publishing" | "published" | "blocked" | "error";

// Saved-quiz editor. Reuses the shared QuizView (no rating here). Persistence is
// an explicit Save (PATCH) — not per-keystroke autosave — per the build plan.
export default function EditQuizClient({
  id,
  initialTitle,
  initialConfig,
  initialStatus,
  initialSlug,
}: {
  id: string;
  initialTitle: string;
  initialConfig: QuizConfig;
  initialStatus: string;
  initialSlug: string | null;
}) {
  const [quiz, setQuiz] = useState<GeneratedQuiz>({ title: initialTitle, config: initialConfig });
  const [state, setState] = useState<SaveState>("clean");
  const [publishState, setPublishState] = useState<PublishState>(
    initialStatus === "published" ? "published" : "idle",
  );
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [blockedOutcomes, setBlockedOutcomes] = useState<string[]>([]);

  function editField(path: string, mutate: (draft: GeneratedQuiz) => void) {
    setQuiz((prev) => {
      const draft: GeneratedQuiz = structuredClone(prev);
      mutate(draft);
      return draft;
    });
    setState("dirty");
  }

  async function save(): Promise<boolean> {
    setState("saving");
    try {
      const res = await fetch(`/api/quizzes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: quiz.title, config: quiz.config }),
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
      } else if (data.reason === "missing_cta_url") {
        setBlockedOutcomes((data.outcomes ?? []).map((o: { name: string }) => o.name));
        setPublishState("blocked");
      } else {
        setPublishState("error");
      }
    } catch {
      setPublishState("error");
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
          ← Dashboard
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
          <button
            onClick={publish}
            disabled={publishState === "publishing"}
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
          <p className="font-semibold">Add where this button should send people.</p>
          <p className="mt-1">
            Every outcome needs a CTA link before you can publish. Missing:{" "}
            <strong>{blockedOutcomes.join(", ")}</strong>. Add a full URL (https://…) to each outcome’s
            link field, save, and publish again.
          </p>
        </div>
      )}
      {publishState === "error" && (
        <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Couldn’t publish just now. Please try again.
        </p>
      )}

      <QuizView quiz={quiz} onEdit={editField} />
    </main>
  );
}
