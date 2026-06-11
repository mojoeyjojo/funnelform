"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { GeneratedQuiz, QuizConfig } from "@/lib/schema";
import type {
  BuilderEventType,
  GenerateStage,
  GenerateStreamEvent,
  OutputRating,
} from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { QuizView, Label } from "./QuizView";

type Phase = "idle" | "generating" | "thin" | "done" | "error";
type SaveState = "idle" | "saving" | "error";

const STAGE_COPY: Record<GenerateStage, string> = {
  reading: "Reading your site…",
  writing: "Writing your quiz…",
  validating: "Building your results…",
};

const PENDING_QUIZ_KEY = "ff_pending_quiz";

// Stable per-page-load anonymous session id (the anon generate flow has no
// auth). Every builder_event for this run is keyed by it so the panel can read
// them back.
function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sess-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// Stamp acquisition attribution into a first-party cookie BEFORE any auth, so it
// survives the OAuth/magic-link round-trip and the callback can read it onto the
// profile (Claim 5). No-op if already set.
function captureAttribution(): void {
  if (document.cookie.includes("ff_signup_source=")) return;
  const params = new URLSearchParams(window.location.search);
  const utm = params.get("utm_source");
  const map: Record<string, string> = {
    free_tool: "free_tool",
    comparison: "comparison",
    niche: "niche_page",
    niche_page: "niche_page",
    founder: "founder",
  };
  let source = "direct";
  if (utm && map[utm]) source = map[utm];
  else if (document.referrer && !document.referrer.includes(window.location.host)) source = "other";
  document.cookie = `ff_signup_source=${source}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

export default function Generator() {
  const [sessionId] = useState(newSessionId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<GenerateStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The URL is the default hero input; the textarea is an opt-in escape hatch
  // for users with no website. Only one is ever mounted (the swap is the whole
  // mechanism — no tabs/toggles). Both values persist across swaps.
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [input, setInput] = useState("");
  const [description, setDescription] = useState("");
  const [thinForm, setThinForm] = useState({ whatYouDo: "", whoYouServe: "", mainOffer: "" });

  // The URL a quiz was generated from (best-effort source_url when saved).
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  // Editable copy of the generated quiz.
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [rating, setRating] = useState<OutputRating | null>(null);

  // Auth + persistence. `undefined` = still loading the session.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Instrumentation panel is a dev/debug surface, not a landing-page element.
  const [debug, setDebug] = useState(false);

  // Track distinct edited field paths so field_edited fires once per field.
  const editedPaths = useRef<Set<string>>(new Set());
  // Bump to tell the events panel to refresh.
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshEvents = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Resolve the current session once; capture attribution; check debug flag.
  useEffect(() => {
    captureAttribution();
    setDebug(new URLSearchParams(window.location.search).has("debug"));
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
  }, []);

  // Value-first claim: once we know the user is signed in, persist any quiz they
  // stashed before authenticating (the magic-moment output carried across the
  // auth round-trip), then land them on the dashboard.
  useEffect(() => {
    if (!user) return;
    const pending = window.localStorage.getItem(PENDING_QUIZ_KEY);
    if (!pending) return;
    window.localStorage.removeItem(PENDING_QUIZ_KEY);
    (async () => {
      try {
        const res = await fetch("/api/quizzes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: pending,
        });
        if (res.ok) window.location.href = "/dashboard";
      } catch {
        // leave them on the page; they can re-save manually
      }
    })();
  }, [user]);

  const recordClientEvent = useCallback(
    async (eventType: BuilderEventType, metadata?: Record<string, unknown>) => {
      try {
        await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, eventType, metadata }),
        });
      } catch {
        // instrumentation must never block the UI
      } finally {
        refreshEvents();
      }
    },
    [sessionId, refreshEvents],
  );

  // Fire first_output_viewed exactly once, on first render of a generated quiz,
  // BEFORE any edit (so the rating signal reads raw AI quality).
  useEffect(() => {
    if (phase === "done" && quiz) {
      void recordClientEvent("first_output_viewed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === "done" && quiz != null]);

  async function runGenerate(payload: Record<string, unknown>) {
    setPhase("generating");
    setStage(null);
    setError(null);
    setQuiz(null);
    setRating(null);
    setSaveState("idle");
    editedPaths.current = new Set();

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, ...payload }),
      });
      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      // Read the NDJSON stream; each line is a real pipeline event.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          handleStreamEvent(JSON.parse(line) as GenerateStreamEvent);
        }
      }
      // Server records generate_started/succeeded/failed; refresh the panel.
      refreshEvents();
    } catch {
      setPhase("error");
      setError("Something went wrong contacting the generator. Please try again.");
    }
  }

  function handleStreamEvent(evt: GenerateStreamEvent) {
    switch (evt.type) {
      case "stage":
        setStage(evt.stage);
        break;
      case "thin_site":
        setPhase("thin");
        break;
      case "done":
        setQuiz({ title: evt.title, config: evt.config as QuizConfig });
        setPhase("done");
        break;
      case "error":
        setError(evt.message);
        setPhase("error");
        break;
    }
  }

  function onSubmitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setSourceUrl(input.trim());
    void runGenerate({ input });
  }

  // The freeform description rides the same `input` field: the server routes any
  // non-URL input to the text-description branch (route.ts), so no new API path.
  function onSubmitDescription(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSourceUrl(null);
    void runGenerate({ input: description });
  }

  function onSubmitThin(e: React.FormEvent) {
    e.preventDefault();
    setSourceUrl(null);
    void runGenerate({ description: thinForm });
  }

  function chooseRating(r: OutputRating) {
    if (rating) return;
    setRating(r);
    void recordClientEvent("output_rating", { rating: r });
  }

  // Immutable edit of the quiz, firing field_edited once per distinct path.
  function editField(path: string, mutate: (draft: GeneratedQuiz) => void) {
    setQuiz((prev) => {
      if (!prev) return prev;
      const draft: GeneratedQuiz = structuredClone(prev);
      mutate(draft);
      return draft;
    });
    if (!editedPaths.current.has(path)) {
      editedPaths.current.add(path);
      void recordClientEvent("field_edited", { field_path: path });
    }
  }

  // Save the generated quiz. Value-first: if signed in, persist immediately and
  // go to the dashboard; if not, stash it and send them through auth — the claim
  // effect saves it on their return. The account wall comes AFTER the magic moment.
  async function saveQuiz() {
    if (!quiz) return;
    const payload = JSON.stringify({
      title: quiz.title,
      config: quiz.config,
      source_url: sourceUrl ?? undefined,
    });
    if (user) {
      setSaveState("saving");
      try {
        const res = await fetch("/api/quizzes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        if (res.ok) window.location.href = "/dashboard";
        else setSaveState("error");
      } catch {
        setSaveState("error");
      }
    } else {
      window.localStorage.setItem(PENDING_QUIZ_KEY, payload);
      window.location.href = "/login?next=" + encodeURIComponent("/");
    }
  }

  const busy = phase === "generating";

  return (
    <main>
      {/* ============ HERO — dreamy daylight sky (serene, weightless) ============ */}
      <section className="relative isolate flex min-h-svh flex-col overflow-hidden">
        {/* Sky: base gradient + sun bloom + mint rise + SVG ellipse-cluster
            clouds, feathered into the pearl page at both edges. No image asset. */}
        <HeroSky />

        {/* Nav — floats over the sky (absolute) so it doesn't take layout space
            and the hero copy centers against the FULL viewport height. */}
        <nav className="absolute inset-x-0 top-0 z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-6 sm:px-8">
          <span className="text-lg font-extrabold tracking-tight text-ink-950">
            Funnelform
          </span>
          {user ? (
            <a
              href="/dashboard"
              className="rounded-full border border-ink-950/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-ink-950 transition-all hover:border-signal-600 hover:text-signal-600 active:scale-[0.98]"
            >
              Dashboard →
            </a>
          ) : user === null ? (
            <a
              href="/login"
              className="rounded-full border border-ink-950/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-ink-950 transition-all hover:border-signal-600 hover:text-signal-600 active:scale-[0.98]"
            >
              Sign in
            </a>
          ) : (
            <span className="h-8" />
          )}
        </nav>

        {/* Hero copy + the magic-moment input — centered in the sky */}
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16 text-center sm:px-8">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
            AI quiz funnels for your business
          </p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[0.98] tracking-[-0.04em] text-ink-950 sm:text-6xl">
            Paste your link. Watch the funnel build itself.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
            One URL in, a complete quiz funnel out. Questions, scored outcomes,
            and a follow-up sequence, written for your business in seconds.
          </p>

          {/* Input — URL is the hero; description is the opt-in escape hatch. */}
          <div className="mx-auto mt-10 w-full max-w-2xl text-left">
            {inputMode === "url" ? (
              <>
                <form
                  onSubmit={onSubmitUrl}
                  className="glass-lift flex items-center gap-2 rounded-full p-1.5 pl-5"
                  noValidate
                >
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="yourbusiness.com"
                    disabled={busy}
                    className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink-950 outline-none placeholder:text-gray-400"
                  />
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="shrink-0 rounded-full bg-ink-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white shadow-pill transition-all hover:bg-signal-600 active:scale-[0.98] disabled:opacity-40"
                  >
                    <span className="sm:hidden">Build →</span>
                    <span className="hidden sm:inline">Build my quiz →</span>
                  </button>
                </form>
                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={() => setInputMode("text")}
                    disabled={busy}
                    className="text-xs text-ink-500 underline decoration-ink-300 underline-offset-4 transition-colors hover:text-signal-600 disabled:opacity-40"
                  >
                    No website? Describe your business instead.
                  </button>
                </div>
              </>
            ) : (
              <>
                <form onSubmit={onSubmitDescription} className="space-y-3" noValidate>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="I'm a nutrition coach helping women over 40 balance their hormones naturally. My main offer is a 12-week 1-on-1 program at €1,200."
                    disabled={busy}
                    rows={4}
                    className="glass-lift w-full resize-none rounded-[22px] px-5 py-4 text-sm font-medium leading-relaxed text-ink-950 outline-none placeholder:text-gray-400"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={busy || !description.trim()}
                      className="rounded-full bg-ink-950 px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white shadow-pill transition-all hover:bg-signal-600 active:scale-[0.98] disabled:opacity-40"
                    >
                      Build my quiz →
                    </button>
                  </div>
                </form>
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => setInputMode("url")}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full border border-signal-600 px-4 py-2 text-xs font-semibold text-signal-600 transition-all hover:bg-signal-600/5 active:scale-[0.98] disabled:opacity-40"
                  >
                    ← Use a URL instead
                    <span className="rounded-full bg-signal-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white">
                      Recommended
                    </span>
                  </button>
                </div>
              </>
            )}

            {/* Progress (real pipeline stages) */}
            {busy && (
              <div
                className="mt-6 flex items-center justify-center gap-3 text-sm font-medium text-ink-600"
                aria-live="polite"
                role="status"
              >
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-signal-600" />
                {stage ? STAGE_COPY[stage] : "Starting…"}
              </div>
            )}
          </div>
        </div>
        {/* (bottom feather handled by mask-fade-y on the sky layer) */}
      </section>

      {/* ================= OUTPUT — light app surface ================= */}
      <section className="mx-auto max-w-3xl px-5 pb-20 sm:px-8">
        {/* Thin-site fallback (3 fields) */}
        {phase === "thin" && (
          <form
            onSubmit={onSubmitThin}
            className="mt-10 space-y-3 rounded-[22px] bg-white p-6 shadow-soft ring-1 ring-ink-950/5"
          >
            <p className="text-sm font-semibold">
              We couldn’t read enough from that link. Tell us about your business:
            </p>
            {(
              [
                ["whatYouDo", "What you do"],
                ["whoYouServe", "Who you serve"],
                ["mainOffer", "Your main offer"],
              ] as const
            ).map(([key, label]) => (
              <input
                key={key}
                placeholder={label}
                value={thinForm[key]}
                onChange={(e) => setThinForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-full border border-ink-200 px-4 py-2.5 text-sm outline-none focus:border-signal-600"
              />
            ))}
            <button
              type="submit"
              className="rounded-full bg-ink-950 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white shadow-pill transition-all hover:bg-signal-600 active:scale-[0.98]"
            >
              Build from this →
            </button>
          </form>
        )}

        {/* Error */}
        {phase === "error" && error && (
          <p className="mt-10 rounded-[22px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {error}
          </p>
        )}

        {/* Generated quiz */}
        {phase === "done" && quiz && (
          <>
            {/* Save bar — the account wall, placed AFTER the magic moment. */}
            <div className="glass mt-10 flex flex-col gap-2 rounded-[22px] p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold">
                {user ? "Save this quiz to your account." : "Create a free account to keep going."}
              </p>
              <button
                onClick={saveQuiz}
                disabled={saveState === "saving"}
                className="rounded-full bg-ink-950 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white shadow-pill transition-all hover:bg-signal-600 active:scale-[0.98] disabled:opacity-40"
              >
                {saveState === "saving" ? "Saving…" : user ? "Save quiz →" : "Save & create account →"}
              </button>
            </div>
            {saveState === "error" && (
              <p className="mt-2 text-xs text-rose-700">Couldn’t save just now. Please try again.</p>
            )}

            <QuizView quiz={quiz} rating={rating} onRate={chooseRating} onEdit={editField} />
          </>
        )}

        {/* Instrumentation panel — dev/debug only (?debug) */}
        {debug && (
          <EventsPanel sessionId={sessionId} refreshKey={refreshKey} onRefresh={refreshEvents} />
        )}
      </section>
    </main>
  );
}

// =============================================================================

type EventRow = {
  id: string;
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function EventsPanel({
  sessionId,
  refreshKey,
  onRefresh,
}: {
  sessionId: string;
  refreshKey: number;
  onRefresh: () => void;
}) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events?sessionId=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (!cancelled) {
          setEvents(Array.isArray(data.events) ? data.events : []);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshKey]);

  return (
    <section className="mt-12 border-t border-ink-200/80 pt-6">
      <div className="flex items-center justify-between">
        <Label>builder_events · this session</Label>
        <button onClick={onRefresh} className="text-xs font-semibold text-signal-600">
          Refresh
        </button>
      </div>
      {loaded && events.length === 0 ? (
        <p className="text-xs text-ink-500">
          No events yet. Generate a quiz. (If Supabase isn’t configured, events are skipped server-side.)
        </p>
      ) : (
        <ol className="space-y-1 font-mono text-[11px]">
          {events.map((e) => (
            <li key={e.id} className="flex items-baseline gap-2">
              <span className="text-ink-500">{new Date(e.created_at).toLocaleTimeString()}</span>
              <span className="font-bold text-signal-600">{e.event_type}</span>
              {e.metadata && <MetaSummary meta={e.metadata} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function MetaSummary({ meta }: { meta: Record<string, unknown> }) {
  const shown = Object.entries(meta).filter(([k]) => k !== "session_id");
  if (shown.length === 0) return null;
  return (
    <span className="text-ink-500">
      {shown.map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" ")}
    </span>
  );
}

// =============================================================================
// Daylight sky for the hero: base gradient + warm sun bloom + cool mint rise +
// SVG ellipse-cluster clouds (overlapping ellipses filled with a radial white
// gradient, 95% → 55% → 0%), feathered top/bottom into the page. No image asset.

const HERO_CLOUDS: React.CSSProperties[] = [
  { left: "4%", top: "6%", width: 280, height: 90, opacity: 0.85 },
  { right: "10%", top: "4%", width: 320, height: 100, opacity: 0.8 },
  { left: "14%", top: "34%", width: 260, height: 80, opacity: 0.7 },
  { right: "6%", top: "40%", width: 290, height: 88, opacity: 0.75 },
  { left: "36%", top: "64%", width: 340, height: 110, opacity: 0.7 },
  { right: "18%", bottom: "8%", width: 270, height: 84, opacity: 0.75 },
  { left: "6%", bottom: "4%", width: 230, height: 72, opacity: 0.65 },
];

function HeroSky() {
  return (
    <div
      aria-hidden
      className="mask-fade-y pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* base sky → sunset gradient */}
      <div className="bg-daylight-sky absolute inset-0" />

      {/* warm sun glow, top-right */}
      <div
        className="absolute rounded-full"
        style={{
          right: "8%",
          top: "-6%",
          height: 420,
          width: 420,
          filter: "blur(64px)",
          background:
            "radial-gradient(circle at center, rgba(255,231,186,0.95) 0%, rgba(255,212,156,0.55) 35%, rgba(255,212,156,0) 70%)",
        }}
      />

      {/* cool mint glow, bottom-center */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "40%",
          opacity: 0.6,
          background:
            "radial-gradient(60% 80% at 50% 100%, rgba(158,241,224,0.35), transparent 70%)",
        }}
      />

      {/* clouds */}
      {HERO_CLOUDS.map((style, i) => (
        <svg key={i} className="absolute" style={style} viewBox="0 0 200 80">
          <use href="#ff-cloud" />
        </svg>
      ))}

      {/* reusable cloud symbol */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <radialGradient id="ff-cloud-grad" cx="50%" cy="55%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="70%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <g id="ff-cloud" fill="url(#ff-cloud-grad)">
            <ellipse cx="60" cy="48" rx="42" ry="22" />
            <ellipse cx="100" cy="40" rx="36" ry="26" />
            <ellipse cx="140" cy="48" rx="40" ry="20" />
            <ellipse cx="80" cy="52" rx="30" ry="14" />
            <ellipse cx="120" cy="54" rx="34" ry="16" />
          </g>
        </defs>
      </svg>
    </div>
  );
}
