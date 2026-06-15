"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GeneratedQuiz, QuizConfig } from "@/lib/schema";
import type { OutputRating } from "@/lib/types";
import { QuizView } from "./QuizView";
import { QuizSettings, EmbedSnippet } from "./QuizSettings";
import { StructureNav } from "./StructureNav";
import QuizPlayer from "./QuizPlayer";

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

  // Shell UI state.
  const [activeId, setActiveId] = useState("sec-settings");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"edit" | "preview">("edit");
  const [previewKey, setPreviewKey] = useState(0); // bump to restart the preview
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // First-impression rating, only for just-generated quizzes (?new=1).
  const [ratingSession, setRatingSession] = useState<string | null>(null);
  const [rating, setRating] = useState<OutputRating | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") setRatingSession(params.get("sid") ?? "unknown");
  }, []);

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

  // §5.3 reroll: fetch fresh COPY for one question/outcome and merge it onto the
  // existing item, keeping the hidden logic (option ids/tags/score, outcome
  // match_logic, cta.url) untouched. Marks dirty so the change is saved like any
  // edit. Throws on failure so the button can surface it.
  async function regenerate(target: "question" | "outcome", index: number) {
    const res = await fetch(`/api/quizzes/${id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, index }),
    });
    if (!res.ok) throw new Error("regenerate_failed");
    const data = await res.json();
    setQuiz((prev) => {
      const draft: GeneratedQuiz = structuredClone(prev);
      if (target === "question") {
        const q = draft.config.questions[index];
        if (q) {
          if (typeof data.text === "string" && data.text) q.text = data.text;
          const labels: unknown = data.optionLabels;
          if (Array.isArray(labels)) {
            q.options.forEach((opt, i) => {
              if (typeof labels[i] === "string" && labels[i]) opt.label = labels[i];
            });
          }
        }
      } else {
        const o = draft.config.outcomes[index];
        if (o) {
          if (typeof data.name === "string" && data.name) o.name = data.name;
          if (typeof data.description === "string" && data.description) o.description = data.description;
          if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
            o.recommendations = data.recommendations.filter((r: unknown) => typeof r === "string");
          }
          if (typeof data.ctaLabel === "string" && data.ctaLabel) o.cta.label = data.ctaLabel;
        }
      }
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
    setBannerDismissed(false);
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
    setBannerDismissed(false);
    setPublishState("unpublishing");
    try {
      const res = await fetch(`/api/quizzes/${id}/publish`, { method: "DELETE" });
      setPublishState(res.ok ? "idle" : "error");
    } catch {
      setPublishState("error");
    }
  }

  async function deleteQuiz() {
    const res = await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
    if (res.ok) window.location.href = "/dashboard";
  }

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

        {/* Mobile Edit-Preview toggle (below md) */}
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
        {/* Sidebar, persistent at xl */}
        <aside className="hidden w-[280px] flex-shrink-0 border-r border-[var(--hairline)] bg-white xl:block">
          <StructureNav quiz={quiz} activeId={activeId} onNavigate={navigate} />
        </aside>

        {/* Sidebar drawer, below xl */}
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
}

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
