"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { GeneratedQuiz, QuizConfig } from "@/lib/schema";
import type {
  BuilderEventType,
  GenerateStage,
  GenerateStreamEvent,
  Goal,
} from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { saveQuizAsCurrentUser, newQuizEditorUrl } from "@/lib/saveQuiz";
import { funnelToSignup } from "@/lib/pendingPrompt";
import { Label } from "./QuizView";
import MarketingBody from "./MarketingBody";

// The pre-generation entry flow is a small in-place card stepper. We collect the
// user's GOAL and business context BEFORE firing the AI pipeline, because the
// goal tells the extraction + generation what to look for and optimise toward.
// Two paths share the goal card and the generating card:
//   Flow A (has a URL): entry -> goal -> extraction display -> generating -> editor
//   Flow B (no website): describe -> goal -> generating -> editor
// Everything downstream of the redirect (editor, dashboard, publish, player) is
// untouched; the pipeline still produces the same schema-valid quiz it always has.

type Step = "entry" | "describe" | "goal" | "extraction" | "generating";
type Flow = "A" | "B" | null;

type ExtractFacts = {
  services: string[];
  audience: string;
  tone: string;
  goalMatch: { label: string; value: string };
};

const GOAL_OPTIONS: { value: Goal; emoji: string; title: string; desc: string }[] = [
  {
    value: "book_consultations",
    emoji: "📅",
    title: "Book more consultations",
    desc: "Hot leads go straight to your booking link.",
  },
  {
    value: "promote_offer",
    emoji: "🎯",
    title: "Promote a specific offer",
    desc: "Point every result at your core offer.",
  },
  {
    value: "grow_list",
    emoji: "📧",
    title: "Grow my email list",
    desc: "Every result comes with a strong opt-in.",
  },
  {
    value: "qualify_buyers",
    emoji: "🔍",
    title: "Qualify serious buyers",
    desc: "Low-intent leads exit gracefully.",
  },
];

// Generating-card step labels. The first two are already done by the time this
// card appears (Flow A scraped + extracted; Flow B has the description + goal);
// the rest tick through on real pipeline stage events.
const GEN_STEPS_A = [
  "Read your site with your goal in mind",
  "Found your services and offers",
  "Writing your questions",
  "Building your results",
  "Setting up your CTAs",
];
const GEN_STEPS_B = [
  "Read your description",
  "Understood your goal",
  "Writing your questions",
  "Building your results",
  "Setting up your CTAs",
];

// Map the real pipeline state to a done/active/waiting state per step. Steps 0-1
// are pre-done; writing -> step 2, validating -> step 3, saving -> step 4.
function genStepStatus(
  i: number,
  stage: GenerateStage | null,
  saving: boolean,
): "done" | "active" | "wait" {
  if (i <= 1) return "done";
  if (saving) return i < 4 ? "done" : "active";
  if (stage === "validating") return i < 3 ? "done" : i === 3 ? "active" : "wait";
  if (stage === "writing") return i === 2 ? "active" : "wait";
  return "wait";
}

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

// `inApp` switches the chrome from the public landing framing to the in-workspace
// builder: marketing hero is swapped for a compact heading, and the top-right
// action is a "← Workspace" return link instead of the sign-in / Workspace nav.
// The flow, pipeline, and editor redirect are identical in both contexts.
export default function Generator({ inApp = false }: { inApp?: boolean } = {}) {
  const [sessionId] = useState(newSessionId);

  // --- Stepper state -------------------------------------------------------
  const [step, setStep] = useState<Step>("entry");
  const [flow, setFlow] = useState<Flow>(null);
  // Once the goal is confirmed it stays set; the thin-site recovery reuses it so
  // a user pushed from Flow A into describing their business skips the goal card.
  const [goalLocked, setGoalLocked] = useState(false);

  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState<Goal>("book_consultations");

  // --- Extraction (Flow A) -------------------------------------------------
  const [extracting, setExtracting] = useState(false);
  const [extract, setExtract] = useState<ExtractFacts | null>(null);
  const [extractThin, setExtractThin] = useState(false);
  const [siteContent, setSiteContent] = useState<string | null>(null);

  // --- Generation ----------------------------------------------------------
  const [stage, setStage] = useState<GenerateStage | null>(null);
  const [saving, setSaving] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  // Kept only so a failed save can be retried without regenerating.
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  // Kept so a failed generation can be retried with the same inputs.
  const lastRunRef = useRef<{ payload: Record<string, unknown>; src: string | null } | null>(null);

  // Auth state for the nav. `undefined` = still loading the session.
  const [user, setUser] = useState<User | null | undefined>(undefined);
  // Ref mirror so stream-event closures (created before the setUser render
  // committed) can still read the CURRENT auth state.
  const userRef = useRef<User | null | undefined>(undefined);

  // Instrumentation panel is a dev/debug surface, not a landing-page element.
  const [debug, setDebug] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshEvents = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    captureAttribution();
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user ?? null;
      userRef.current = u;
      setUser(u);
      setDebug(new URLSearchParams(window.location.search).has("debug"));
    });
  }, []);

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

  // ---- Generation pipeline (unchanged contract: streams real NDJSON events) --
  async function runGenerate(payload: Record<string, unknown>, src: string | null) {
    lastRunRef.current = { payload, src };
    setStage(null);
    setSaving(false);
    setGenError(null);
    setQuiz(null);

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
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          handleStreamEvent(JSON.parse(line) as GenerateStreamEvent, payload, src);
        }
      }
      refreshEvents();
    } catch {
      setGenError("Something went wrong contacting the generator. Please try again.");
    }
  }

  function handleStreamEvent(
    evt: GenerateStreamEvent,
    payload: Record<string, unknown>,
    src: string | null,
  ) {
    switch (evt.type) {
      case "stage":
        setStage(evt.stage);
        break;
      case "thin_site":
        // Generation could not read enough from the site (e.g. extraction was
        // skipped). Route the user into describing their business, goal intact.
        thinToDescribe();
        break;
      case "done":
        void saveAndOpen({ title: evt.title, config: evt.config as QuizConfig }, src);
        break;
      case "error": {
        // Rate-limited WITHOUT a real account = the signup funnel, not an error:
        // stash the prompt (goal rides along) and route into account creation.
        const u = userRef.current;
        if (evt.code === "rate_limited" && (!u || u.is_anonymous === true)) {
          void funnelToSignup({ payload, src });
          return;
        }
        setGenError(evt.message);
        break;
      }
    }
  }

  // Jotform flow: the quiz never renders here. It's saved immediately (silent
  // guest session if needed) and opened in the editor, where the rest live.
  async function saveAndOpen(generated: GeneratedQuiz, src: string | null) {
    setQuiz(generated);
    setSaving(true);
    await recordClientEvent("first_output_viewed");
    const id = await saveQuizAsCurrentUser({ quiz: generated, sourceUrl: src });
    if (id) {
      window.location.href = newQuizEditorUrl(id, sessionId);
    } else {
      setSaving(false);
      setGenError("Your quiz was built, but we couldn't open it. Please try again.");
    }
  }

  // ---- Step transitions ----------------------------------------------------
  function goToDescribe() {
    setFlow("B");
    setStep("describe");
  }

  function onSubmitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setFlow("A");
    setGoalLocked(false);
    setStep("goal");
  }

  function onSubmitDescribe(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    if (goalLocked) startGenerateB();
    else setStep("goal");
  }

  function continueGoal() {
    setGoalLocked(true);
    if (flow === "A") void startExtraction();
    else startGenerateB();
  }

  async function startExtraction() {
    setStep("extraction");
    setExtract(null);
    setExtractThin(false);
    setSiteContent(null);
    setExtracting(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, input: url.trim(), goal }),
      });
      const data = (await res.json()) as
        | { thin: true }
        | (ExtractFacts & { siteContent?: string })
        | { error: string };
      if (!res.ok || "error" in data) {
        // Extraction is a nicety, not a gate — skip the preview, generate now.
        startGenerateA(null);
        return;
      }
      if ("thin" in data && data.thin) {
        setExtractThin(true);
      } else {
        const facts = data as ExtractFacts & { siteContent?: string };
        setExtract({
          services: facts.services ?? [],
          audience: facts.audience ?? "",
          tone: facts.tone ?? "",
          goalMatch: facts.goalMatch ?? { label: "", value: "" },
        });
        setSiteContent(facts.siteContent ?? null);
      }
    } catch {
      startGenerateA(null);
      return;
    } finally {
      setExtracting(false);
    }
  }

  // `content` lets the caller force a fresh scrape (null) when extraction was
  // skipped; otherwise we reuse the markdown extraction already fetched.
  function startGenerateA(content: string | null = siteContent) {
    setStep("generating");
    const payload: Record<string, unknown> = { input: url.trim(), goal };
    if (content) payload.siteContent = content;
    void runGenerate(payload, url.trim());
  }

  function startGenerateB() {
    setStep("generating");
    void runGenerate({ input: description.trim(), goal }, null);
  }

  // Thin site (from the extraction card or a thin generate): carry the goal into
  // describing the business instead, and skip the goal card (already chosen).
  function thinToDescribe() {
    setFlow("B");
    setGoalLocked(true);
    setStep("describe");
  }

  function retryGeneration() {
    const last = lastRunRef.current;
    if (last) void runGenerate(last.payload, last.src);
  }

  // ---- Derived: progress dots ---------------------------------------------
  const dotLabels =
    flow === "B"
      ? ["Entry", "Describe", "Goal", "Generate"]
      : ["Entry", "Goal", "Extraction", "Generate", "Output"];
  const dotIndex = (() => {
    if (flow === "B") {
      if (step === "describe") return 1;
      if (step === "goal") return 2;
      if (step === "generating") return 3;
      return 0;
    }
    if (step === "goal") return 1;
    if (step === "extraction") return 2;
    if (step === "generating") return 3;
    return 0;
  })();

  return (
    <main>
      <section className="relative isolate flex min-h-svh flex-col overflow-hidden">
        <HeroSky />

        {/* Topbar — wordmark + flow badge (left), progress dots + auth (right) */}
        <nav className="absolute inset-x-0 top-0 z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-6 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="text-lg font-extrabold tracking-tight text-ink-950">Funnelform</span>
            {flow && <FlowBadge flow={flow} />}
          </div>
          <div className="flex items-center gap-4">
            {flow && <DotBar labels={dotLabels} activeIndex={dotIndex} />}
            {inApp ? (
              <a
                href="/dashboard"
                className="rounded-full border border-ink-950/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-ink-950 transition-all hover:border-signal-600 hover:text-signal-600 active:scale-[0.98]"
              >
                ← Workspace
              </a>
            ) : user ? (
              <a
                href="/dashboard"
                className="rounded-full border border-ink-950/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-ink-950 transition-all hover:border-signal-600 hover:text-signal-600 active:scale-[0.98]"
              >
                Workspace →
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
          </div>
        </nav>

        {/* Centered card slot. Hero copy only at the front door (entry). */}
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-24 text-center sm:px-8">
          {step === "entry" &&
            (inApp ? (
              <div className="mb-9">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
                  New quiz
                </p>
                <h1 className="mt-4 text-3xl font-extrabold leading-[0.98] tracking-[-0.04em] text-ink-950 sm:text-4xl">
                  Let&apos;s build your next funnel
                </h1>
                <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-ink-600">
                  Paste your link or describe your business. It lands straight in
                  your workspace.
                </p>
              </div>
            ) : (
              <div className="mb-9">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
                  AI quiz funnels for your business
                </p>
                <h1 className="mt-4 text-4xl font-extrabold leading-[0.98] tracking-[-0.04em] text-ink-950 sm:text-5xl">
                  Paste your link. Watch the funnel build itself.
                </h1>
                <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-ink-600">
                  One URL in, a complete quiz funnel out — questions, scored
                  outcomes, and a follow-up sequence, in seconds.
                </p>
              </div>
            ))}

          <StepCard key={step}>
            {step === "entry" && (
              <EntryCard
                url={url}
                setUrl={setUrl}
                onSubmit={onSubmitUrl}
                onDescribe={goToDescribe}
              />
            )}

            {step === "describe" && (
              <DescribeCard
                description={description}
                setDescription={setDescription}
                onSubmit={onSubmitDescribe}
                onBack={goalLocked ? undefined : () => setStep("entry")}
                ctaLabel={goalLocked ? "Build my quiz" : "Continue"}
              />
            )}

            {step === "goal" && (
              <GoalCard
                flow={flow}
                goal={goal}
                setGoal={setGoal}
                onContinue={continueGoal}
                onBack={() => setStep(flow === "B" ? "describe" : "entry")}
              />
            )}

            {step === "extraction" && (
              <ExtractionCard
                extracting={extracting}
                extract={extract}
                thin={extractThin}
                onContinue={() => startGenerateA()}
                onDescribe={thinToDescribe}
              />
            )}

            {step === "generating" && (
              <GeneratingCard
                flow={flow}
                stage={stage}
                saving={saving}
                error={genError}
                hasQuiz={!!quiz}
                onRetry={retryGeneration}
                onOpen={() => quiz && void saveAndOpen(quiz, lastRunRef.current?.src ?? null)}
              />
            )}
          </StepCard>
        </div>
      </section>

      {/* Marketing body grows downward from the hero on `/` — idle state only,
          and never in the in-app builder (design-pass §2.1). */}
      {!inApp && step === "entry" && <MarketingBody />}

      {debug && (
        <section className="mx-auto max-w-3xl px-5 pb-20 sm:px-8">
          <EventsPanel sessionId={sessionId} refreshKey={refreshKey} onRefresh={refreshEvents} />
        </section>
      )}
    </main>
  );
}

// =============================================================================
// Stepper chrome

// Crossfade-in wrapper: each step remounts (keyed) and animates opacity +
// translateY. Reduced motion collapses the transition globally.
function StepCard({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return (
    <div
      className={`transition-all duration-[360ms] ease-[cubic-bezier(.4,0,.2,1)] motion-reduce:transition-none ${
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

function DotBar({ labels, activeIndex }: { labels: string[]; activeIndex: number }) {
  return (
    <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
      {labels.map((label, i) => (
        <span
          key={label}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            i === activeIndex
              ? "w-4 bg-signal-600"
              : i < activeIndex
                ? "w-1.5 bg-emerald-500"
                : "w-1.5 bg-ink-200"
          }`}
        />
      ))}
    </div>
  );
}

function FlowBadge({ flow }: { flow: "A" | "B" }) {
  return flow === "A" ? (
    <span className="rounded-full bg-signal-600/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-signal-600">
      Flow A
    </span>
  ) : (
    <span className="rounded-full bg-[#1ec4b2]/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#0d8f82]">
      Flow B
    </span>
  );
}

// Shared glass panel for every step card.
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass mx-auto w-full rounded-[22px] p-7 text-left sm:p-8 ${className}`}>
      {children}
    </div>
  );
}

const PRIMARY_BTN =
  "rounded-full bg-ink-950 px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white shadow-pill transition-all hover:bg-signal-600 active:scale-[0.98] disabled:opacity-40";

// =============================================================================
// Step cards

function EntryCard({
  url,
  setUrl,
  onSubmit,
  onDescribe,
}: {
  url: string;
  setUrl: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDescribe: () => void;
}) {
  return (
    <Panel>
      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 rounded-full border border-ink-200 bg-white/70 p-1.5 pl-5"
        noValidate
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="yourbusiness.com"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink-950 outline-none placeholder:text-ink-400"
          aria-label="Your website URL"
        />
        <button type="submit" disabled={!url.trim()} className={`shrink-0 ${PRIMARY_BTN}`}>
          <span className="sm:hidden">Start →</span>
          <span className="hidden sm:inline">Build my quiz →</span>
        </button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-ink-200/80" />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">or</span>
        <span className="h-px flex-1 bg-ink-200/80" />
      </div>

      <button
        type="button"
        onClick={onDescribe}
        className="w-full text-center text-sm font-medium text-ink-500 underline decoration-ink-300 underline-offset-4 transition-colors hover:text-signal-600"
      >
        Describe your business instead
      </button>
    </Panel>
  );
}

function DescribeCard({
  description,
  setDescription,
  onSubmit,
  onBack,
  ctaLabel,
}: {
  description: string;
  setDescription: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack?: () => void;
  ctaLabel: string;
}) {
  return (
    <Panel>
      <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink-950">
        Tell us about your business
      </h2>

      {/* Two numbered cues live INSIDE a tinted container — guidance, not fields. */}
      <div className="mt-4 rounded-[16px] bg-signal-600/[0.04] p-4 ring-1 ring-signal-600/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-500">
          Cover these two things
        </p>
        <ol className="mt-2 space-y-1.5 text-sm text-ink-600">
          <li className="flex gap-2">
            <span className="font-mono text-xs font-bold text-signal-600">1.</span>
            What do you do, and who do you do it for?
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-xs font-bold text-signal-600">2.</span>
            What is your main offer or service?
          </li>
        </ol>
      </div>

      <form onSubmit={onSubmit} className="mt-4" noValidate>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="I'm a nutrition coach helping women over 40 balance their hormones naturally. My main offer is a 12-week 1-on-1 program at €1,200."
          className="w-full resize-none rounded-[16px] border border-ink-200 bg-white/70 px-4 py-3 text-sm font-medium leading-relaxed text-ink-950 outline-none transition-colors placeholder:text-ink-400 focus:border-signal-600"
          aria-label="Describe your business"
        />
        <div className="mt-4 flex items-center justify-between">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-medium text-ink-500 transition-colors hover:text-signal-600"
            >
              ← Use a website
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={!description.trim()} className={PRIMARY_BTN}>
            {ctaLabel} →
          </button>
        </div>
      </form>
    </Panel>
  );
}

function GoalCard({
  flow,
  goal,
  setGoal,
  onContinue,
  onBack,
}: {
  flow: Flow;
  goal: Goal;
  setGoal: (g: Goal) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <Panel>
      <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink-950">
        What should this quiz do for you?
      </h2>
      <p className="mt-1.5 text-sm text-ink-500">
        {flow === "A"
          ? "We'll use this to know exactly what to look for on your site."
          : "We'll shape your questions, outcomes, and CTAs around this."}
      </p>

      <div className="mt-5 grid gap-2.5">
        {GOAL_OPTIONS.map((opt) => {
          const selected = goal === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGoal(opt.value)}
              aria-pressed={selected}
              className={`flex items-start gap-3 rounded-[16px] border p-3.5 text-left transition-all active:scale-[0.99] ${
                selected
                  ? "border-signal-600 bg-signal-600/[0.04]"
                  : "border-ink-200 bg-white/60 hover:border-ink-300"
              }`}
            >
              <span className="text-xl leading-none" aria-hidden>
                {opt.emoji}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink-950">{opt.title}</span>
                <span className="block text-xs leading-snug text-ink-500">{opt.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-ink-500 transition-colors hover:text-signal-600"
        >
          ← Back
        </button>
        <button type="button" onClick={onContinue} className={PRIMARY_BTN}>
          Continue →
        </button>
      </div>
    </Panel>
  );
}

function ExtractionCard({
  extracting,
  extract,
  thin,
  onContinue,
  onDescribe,
}: {
  extracting: boolean;
  extract: ExtractFacts | null;
  thin: boolean;
  onContinue: () => void;
  onDescribe: () => void;
}) {
  if (extracting) {
    return (
      <Panel>
        <div className="flex items-center gap-3" aria-live="polite" role="status">
          <span className="h-2 w-2 animate-pulse rounded-full bg-signal-600 motion-reduce:animate-none" />
          <p className="text-sm font-semibold text-ink-700">
            Reading your site with your goal in mind…
          </p>
        </div>
        <div className="mt-5 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-3 animate-pulse rounded-full bg-ink-100 motion-reduce:animate-none"
              style={{ width: `${85 - i * 18}%` }}
            />
          ))}
        </div>
      </Panel>
    );
  }

  if (thin || !extract) {
    return (
      <Panel>
        <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink-950">
          We couldn&apos;t read enough from that link
        </h2>
        <p className="mt-2 text-sm text-ink-600">
          Some sites block readers or are light on text. Tell us about your
          business instead and we&apos;ll take it from there — your goal is
          already set.
        </p>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={onDescribe} className={PRIMARY_BTN}>
            Describe your business →
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink-950">
        Here&apos;s what we found
      </h2>
      <p className="mt-1.5 text-sm text-ink-500">
        We&apos;ll build your quiz around this. You can fine-tune everything in
        the editor.
      </p>

      <dl className="mt-5 space-y-3">
        {extract.services.length > 0 && (
          <ExtractRow label="Services">
            <div className="flex flex-wrap gap-1.5">
              {extract.services.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-700"
                >
                  {s}
                </span>
              ))}
            </div>
          </ExtractRow>
        )}
        {extract.audience && <ExtractRow label="Audience">{extract.audience}</ExtractRow>}
        {extract.tone && <ExtractRow label="Tone">{extract.tone}</ExtractRow>}
        {extract.goalMatch.value && (
          <div className="rounded-[16px] border border-signal-600/20 bg-signal-600/[0.04] p-3.5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-signal-600">
              ↑ matched to your goal · {extract.goalMatch.label}
            </p>
            <p className="mt-1 text-sm font-medium text-ink-800">{extract.goalMatch.value}</p>
          </div>
        )}
      </dl>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={onDescribe}
          className="text-sm font-medium text-ink-500 transition-colors hover:text-signal-600"
        >
          Not quite right?
        </button>
        <button type="button" onClick={onContinue} className={PRIMARY_BTN}>
          Looks good, build it →
        </button>
      </div>
    </Panel>
  );
}

function ExtractRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] items-baseline gap-3">
      <dt className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
        {label}
      </dt>
      <dd className="text-sm text-ink-700">{children}</dd>
    </div>
  );
}

function GeneratingCard({
  flow,
  stage,
  saving,
  error,
  hasQuiz,
  onRetry,
  onOpen,
}: {
  flow: Flow;
  stage: GenerateStage | null;
  saving: boolean;
  error: string | null;
  hasQuiz: boolean;
  onRetry: () => void;
  onOpen: () => void;
}) {
  const steps = flow === "B" ? GEN_STEPS_B : GEN_STEPS_A;

  if (error) {
    return (
      <Panel>
        <div className="rounded-[16px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {hasQuiz ? (
            <button type="button" onClick={onOpen} className={PRIMARY_BTN}>
              Open my quiz →
            </button>
          ) : (
            <button type="button" onClick={onRetry} className={PRIMARY_BTN}>
              Try again →
            </button>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <h2 className="text-xl font-extrabold tracking-[-0.02em] text-ink-950">
        {saving ? "Opening your quiz…" : "Building your quiz…"}
      </h2>
      <ol className="mt-5 space-y-3" aria-live="polite">
        {steps.map((label, i) => {
          const status = genStepStatus(i, stage, saving);
          return (
            <li key={label} className="flex items-center gap-3">
              <StepDot status={status} />
              <span
                className={`text-sm ${
                  status === "active"
                    ? "font-semibold text-ink-900"
                    : status === "done"
                      ? "text-ink-500"
                      : "text-ink-400"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function StepDot({ status }: { status: "done" | "active" | "wait" }) {
  if (status === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] text-white">
        ✓
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-600/40 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal-600" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      <span className="inline-flex h-2.5 w-2.5 rounded-full border border-ink-200" />
    </span>
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
