"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GeneratedQuiz, QuizConfig } from "@/lib/schema";
import type { OutputRating, QuizDestination } from "@/lib/types";
import type { FollowUpConfig } from "@/lib/delivery/templates";
import { QuizView } from "./QuizView";
import { QuizSettings, EmbedSnippet } from "./QuizSettings";
import { StructureNav } from "./StructureNav";
import QuizPlayer from "./QuizPlayer";
import { capture } from "@/lib/analytics";

type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";
type PublishState =
  | "idle"
  | "publishing"
  | "published"
  | "unpublishing"
  | "blocked"
  | "plan_blocked"
  | "error";

// Saved-quiz editor (mockup: 07-editor-light). A three-pane workspace: structure
// sidebar, editor, and a live player preview. Neutral light theme via `.editor-ui`
// (see globals.css). Persistence is an explicit Save (PATCH), not per-keystroke
// autosave. Just-generated quizzes arrive with ?new=1&sid=<session> and show the
// one-tap first-impression rating (output_rating instrumentation).
export default function EditQuizClient({
  id,
  initialTitle,
  initialConfig,
  initialStatus,
  initialSlug,
  initialWhatsapp,
  initialWebhook,
  initialBranding,
  initialAccent,
  initialFollowUp,
  initialDestinations,
  hasPro,
  isGuest,
}: {
  id: string;
  initialTitle: string;
  initialConfig: QuizConfig;
  initialStatus: string;
  initialSlug: string | null;
  initialWhatsapp: string;
  initialWebhook: string;
  initialBranding: boolean;
  initialAccent: string | null;
  initialFollowUp: FollowUpConfig;
  initialDestinations: QuizDestination[];
  hasPro: boolean;
  isGuest: boolean;
}) {
  const [quiz, setQuiz] = useState<GeneratedQuiz>({ title: initialTitle, config: initialConfig });
  const [whatsapp, setWhatsapp] = useState(initialWhatsapp);
  const [webhook, setWebhook] = useState(initialWebhook);
  const [branding, setBranding] = useState(initialBranding);
  const [accent, setAccent] = useState<string | null>(initialAccent);
  const [followUp, setFollowUp] = useState<FollowUpConfig>(initialFollowUp);
  const [destinations, setDestinations] = useState<QuizDestination[]>(initialDestinations);
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
  const [toastDismissed, setToastDismissed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false); // phone overflow menu (Save / Unpublish)
  const editorRef = useRef<HTMLDivElement>(null);

  // First-impression rating, only for just-generated quizzes (?new=1).
  const [ratingSession] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return p.get("new") === "1" ? (p.get("sid") ?? "unknown") : null;
  });
  const [rating, setRating] = useState<OutputRating | null>(null);

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

  // Escape closes the transient overlays (structure drawer, phone overflow menu).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDrawerOpen(false);
        setMoreOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function navigate(id: string) {
    const el = editorRef.current?.querySelector(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setDrawerOpen(false);
    if (mobileTab !== "edit") setMobileTab("edit");
  }

  async function recordRating(r: OutputRating) {
    if (rating) return;
    setRating(r);
    capture("output_rating", { rating: r });
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

  function editWebhook(value: string) {
    setWebhook(value);
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

  function editFollowUp(next: FollowUpConfig) {
    setFollowUp(next);
    setState("dirty");
  }

  function editDestinations(next: QuizDestination[]) {
    setDestinations(next);
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
          webhook,
          followUp,
          destinations,
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
  // then publish. Surfaces the CTA-URL validation block as a toast.
  async function publish() {
    setToastDismissed(false);
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
        capture("published", { quiz_id: id });
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
    setToastDismissed(false);
    setPublishState("unpublishing");
    try {
      const res = await fetch(`/api/quizzes/${id}/publish`, { method: "DELETE" });
      setPublishState(res.ok ? "idle" : "error");
    } catch {
      setPublishState("error");
    }
  }

  async function deleteQuiz() {
    let res: Response;
    try {
      res = await fetch(`/api/quizzes/${id}`, { method: "DELETE" });
    } catch {
      throw new Error("delete_failed");
    }
    if (res.ok) window.location.href = "/dashboard";
    else throw new Error("delete_failed");
  }

  const playerUrl = slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/q/${slug}`
    : null;
  const isLive = publishState === "published" && !!playerUrl;
  const showToast =
    !toastDismissed &&
    (publishState === "blocked" || publishState === "plan_blocked" || publishState === "error");

  return (
    <div className="editor-ui flex h-screen flex-col overflow-hidden bg-[var(--e-bg)] text-[var(--foreground)]">
      {/* Topbar */}
      <header className="z-20 flex h-[60px] flex-shrink-0 items-center gap-3 border-b border-[var(--hairline)] bg-white px-4 sm:px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5 pr-4 sm:border-r sm:border-[var(--hairline)]">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-[var(--signal)]">
            <LogoMark />
          </span>
          <span className="hidden text-[16px] font-extrabold tracking-[-0.02em] sm:block">Treeflow</span>
        </Link>
        <div className="hidden min-w-0 flex-1 items-center gap-1.5 md:flex">
          <Link
            href="/dashboard"
            className="text-[13px] font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            My quizzes
          </Link>
          <span className="text-[13px] text-[var(--e-text-faint)]">/</span>
          <span className="truncate text-[13px] font-semibold">{quiz.title || "Untitled quiz"}</span>
        </div>

        {/* Structure trigger (below xl) */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="ml-auto rounded-full border border-[var(--hairline)] px-3 py-1.5 text-[12px] font-semibold text-[var(--e-text-2)] transition-colors hover:border-black/20 xl:hidden"
        >
          Structure
        </button>

        {/* Mobile Edit/Preview toggle (below md) */}
        <div className="flex rounded-full border border-[var(--hairline)] p-0.5 md:hidden">
          {(["edit", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMobileTab(t)}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold capitalize transition-colors ${
                mobileTab === t ? "bg-[var(--signal)] text-white" : "text-[var(--muted)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2.5 md:ml-3">
          <SaveStatus state={state} />

          {/* Phone overflow menu: Save + Unpublish live here below sm, where the
              inline buttons are hidden, so a phone can still save a draft or take
              a quiz offline. */}
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="More actions"
              className="rounded-full border border-[var(--hairline)] px-3 py-1.5 text-[13px] font-bold transition-colors hover:border-black/20"
            >
              ⋯
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-[14px] border border-[var(--hairline)] bg-white py-1 shadow-xl"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      void save();
                    }}
                    disabled={state === "saving" || state === "clean" || state === "saved"}
                    className="block w-full px-4 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-[var(--e-surface-3)] disabled:opacity-40"
                  >
                    {state === "saving" ? "Saving…" : "Save changes"}
                  </button>
                  {(publishState === "published" || publishState === "unpublishing") && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        void unpublish();
                      }}
                      disabled={publishState === "unpublishing"}
                      className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-40"
                    >
                      {publishState === "unpublishing" ? "Taking offline…" : "Unpublish"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            onClick={save}
            disabled={state === "saving" || state === "clean" || state === "saved"}
            className="hidden h-9 rounded-full border border-[var(--hairline)] px-4 text-[13px] font-semibold text-[var(--e-text-2)] transition-colors hover:border-black/20 hover:text-[var(--foreground)] disabled:opacity-40 sm:block"
          >
            {state === "saving" ? "Saving…" : "Save"}
          </button>
          {(publishState === "published" || publishState === "unpublishing") && (
            <button
              onClick={unpublish}
              disabled={publishState === "unpublishing"}
              className="hidden h-9 rounded-full border border-[var(--hairline)] px-4 text-[13px] font-semibold text-[var(--e-text-2)] transition-colors hover:border-rose-300 hover:text-rose-600 disabled:opacity-40 sm:block"
            >
              {publishState === "unpublishing" ? "Offline…" : "Unpublish"}
            </button>
          )}
          <button
            onClick={publish}
            disabled={publishState === "publishing" || publishState === "unpublishing"}
            className="h-9 rounded-full bg-[var(--signal)] px-4 text-[13px] font-bold text-white shadow-[0_2px_12px_-4px_var(--e-accent-glow-md)] transition-colors hover:bg-[var(--e-accent-bright)] disabled:opacity-40"
          >
            {publishState === "publishing"
              ? "Publishing…"
              : publishState === "published"
                ? "Re-publish"
                : "Publish →"}
          </button>
        </div>
      </header>

      {/* Workspace */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar, persistent at xl */}
        <aside className="hidden w-[300px] flex-shrink-0 border-r border-[var(--hairline)] bg-white xl:block">
          <StructureNav quiz={quiz} activeId={activeId} onNavigate={navigate} published={isLive} />
        </aside>

        {/* Sidebar drawer, below xl */}
        {drawerOpen && (
          <div role="dialog" aria-modal="true" aria-label="Quiz structure" className="fixed inset-0 z-30 xl:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-[280px] border-r border-[var(--hairline)] bg-white shadow-xl">
              <StructureNav quiz={quiz} activeId={activeId} onNavigate={navigate} published={isLive} />
            </div>
          </div>
        )}

        {/* Editor pane */}
        <main
          ref={editorRef}
          className={`min-h-0 flex-1 overflow-y-auto bg-white px-6 py-8 sm:px-10 ${
            mobileTab === "edit" ? "block" : "hidden"
          } md:block md:border-r md:border-[var(--hairline)]`}
        >
          <div className="mx-auto max-w-[640px] pb-20">
            {isLive && playerUrl && <ShareCard playerUrl={playerUrl} quizTitle={quiz.title} />}
            <QuizSettings
              whatsapp={whatsapp}
              webhook={webhook}
              branding={branding}
              accent={accent}
              hasPro={hasPro}
              rating={ratingSession ? rating : undefined}
              onRate={ratingSession ? recordRating : undefined}
              onWhatsapp={editWhatsapp}
              onWebhook={editWebhook}
              onBranding={editBranding}
              onAccent={editAccent}
              onDelete={deleteQuiz}
              followUp={followUp}
              onFollowUp={editFollowUp}
              destinations={destinations}
              onDestinations={editDestinations}
              quizTitle={quiz.title}
              outcomes={quiz.config.outcomes.map((o) => ({
                id: o.id,
                name: o.name,
                description: o.description,
                hasCta: Boolean(o.cta?.url?.trim()),
              }))}
            />
            <div className="mt-10">
              <QuizView quiz={quiz} onEdit={editField} onRegenerate={regenerate} />
            </div>
          </div>
        </main>

        {/* Preview pane */}
        <section
          className={`min-h-0 flex-1 overflow-y-auto bg-[var(--e-bg)] ${
            mobileTab === "preview" ? "flex" : "hidden"
          } flex-col items-center md:flex`}
        >
          <div className="flex w-full items-center justify-between px-5 pt-5 sm:px-6">
            <span className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--e-text-faint)]">
              Live preview
              <span className="rounded-full border border-[var(--hairline)] bg-white px-2.5 py-0.5 text-[10px] tracking-normal text-[var(--muted)]">
                visitor view
              </span>
            </span>
            <button
              type="button"
              onClick={() => setPreviewKey((k) => k + 1)}
              className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
              ↻ Restart
            </button>
          </div>
          {/* Phone shell on md+, full-bleed on mobile */}
          <div className="flex w-full flex-1 justify-center px-0 py-6 sm:px-6 sm:py-10">
            <div className="w-full self-start md:w-[320px] md:overflow-hidden md:rounded-[36px] md:bg-white md:shadow-[0_0_0_8px_#e8e8e6,0_40px_80px_-24px_rgba(0,0,0,0.3)]">
              <div className="hidden h-7 items-center justify-center bg-[#0e0e0e] md:flex">
                <span className="h-[5px] w-[60px] rounded-full bg-white/15" />
              </div>
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
          <p className="hidden px-6 pb-10 text-center text-[12px] leading-relaxed text-[var(--e-text-faint)] md:block">
            The player uses your brand colour, not ours.
          </p>
        </section>
      </div>

      {/* Transient publish feedback (validation / plan / error) */}
      {showToast && (
        <PublishToast
          publishState={publishState}
          blockedOutcomes={blockedOutcomes}
          onDismiss={() => setToastDismissed(true)}
        />
      )}
    </div>
  );
}

// Accent app-mark in the topbar (mockup logo-mark).
function LogoMark() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
    </svg>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === "saved")
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-[var(--e-success-bg)] px-3 py-1.5 text-[12px] font-semibold text-[var(--e-success)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--e-success)]" />
        Saved
      </span>
    );
  if (state === "saving")
    return <span className="text-[12px] font-medium text-[var(--muted)]">Saving…</span>;
  if (state === "dirty")
    return <span className="hidden text-[12px] font-medium text-[var(--muted)] sm:inline">Unsaved</span>;
  if (state === "error")
    return <span className="text-[12px] font-semibold text-rose-600">Save failed</span>;
  return null;
}

// The published quiz's live link + embed, shown at the top of the editor (an
// "Share & publish" section the sidebar links to) rather than as a banner.
function ShareCard({ playerUrl, quizTitle }: { playerUrl: string; quizTitle: string }) {
  return (
    <div
      id="sec-share"
      data-nav-section
      className="mb-10 scroll-mt-6 rounded-[20px] border-[1.5px] border-[var(--hairline)] bg-[var(--e-surface-2)] p-5"
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[var(--e-success)]" />
        <span className="text-[13px] font-bold text-[var(--foreground)]">Your quiz is live</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <a
          href={playerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate rounded-full border border-[var(--hairline)] bg-white px-4 py-2.5 text-[13px] font-medium text-[var(--signal)] underline-offset-2 hover:underline"
        >
          {playerUrl}
        </a>
        <a
          href={playerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full bg-[var(--signal)] px-4 py-2.5 text-[12px] font-bold text-white transition-colors hover:bg-[var(--e-accent-bright)]"
        >
          Open ↗
        </a>
      </div>
      <EmbedSnippet url={playerUrl} title={quizTitle} />
    </div>
  );
}

// Compact, dismissible feedback for publish problems, bottom-right instead of a
// full-width banner over the editor.
function PublishToast({
  publishState,
  blockedOutcomes,
  onDismiss,
}: {
  publishState: PublishState;
  blockedOutcomes: string[];
  onDismiss: () => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-[16px] border border-[var(--hairline)] bg-white p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.3)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-[13px] leading-relaxed">
          {publishState === "blocked" && (
            <>
              <p className="font-semibold text-[var(--foreground)]">Check your button links.</p>
              <p className="mt-1 text-[var(--e-text-2)]">
                A button link is optional, but if you add one it has to be a full web address. Please
                fix: <strong>{blockedOutcomes.join(", ")}</strong>. Use a full URL like
                https://calendly.com/you/intro-call, then publish again.
              </p>
            </>
          )}
          {publishState === "plan_blocked" && (
            <>
              <p className="font-semibold text-[var(--foreground)]">The free plan includes one live quiz.</p>
              <p className="mt-1 text-[var(--e-text-2)]">
                You already have a quiz live. Upgrade to Pro to publish as many as you like, or
                unpublish the other one first.
              </p>
              <Link
                href="/pricing"
                className="mt-2.5 inline-block rounded-full bg-[var(--signal)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white"
              >
                See Pro →
              </Link>
            </>
          )}
          {publishState === "error" && (
            <p className="text-[var(--e-text-2)]">Couldn’t publish just now. Please try again.</p>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 text-[var(--e-text-faint)] transition-colors hover:text-[var(--foreground)]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
