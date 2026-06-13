"use client";

import { useEffect, useRef, useState } from "react";
import type { GeneratedQuiz, QuizConfig } from "@/lib/schema";
import type { GenerateStage, GenerateStreamEvent } from "@/lib/types";
import { saveQuizAsCurrentUser, newQuizEditorUrl } from "@/lib/saveQuiz";
import { funnelToSignup } from "@/lib/pendingPrompt";

type Phase = "idle" | "generating" | "saving" | "thin" | "error";

const STAGE_COPY: Record<GenerateStage, string> = {
  reading: "Reading your site…",
  writing: "Writing your quiz…",
  validating: "Building your results…",
};

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
    };
  }
}

function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ft-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// The free tool (build spec §5.10): the magic moment, ungated, IP-capped.
// Same Jotform flow as the landing page: the generated quiz is saved under a
// silent guest session and opened in the editor — it never renders here.
export default function FreeTool() {
  const [sessionId] = useState(newSessionId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stage, setStage] = useState<GenerateStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  const [input, setInput] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  // Kept only so a failed save can be retried without regenerating.
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [token, setToken] = useState("");
  const widgetRef = useRef<HTMLDivElement>(null);

  // Stamp signup_source=free_tool BEFORE the guest profile is created, so the
  // signup attributes to the free tool (Claim 5). 30-day first-party cookie.
  useEffect(() => {
    document.cookie = `ff_signup_source=free_tool; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }, []);

  // Render the Turnstile bot challenge (only if a site key is configured).
  useEffect(() => {
    if (!SITE_KEY || !widgetRef.current) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !widgetRef.current || !window.turnstile) return;
      window.turnstile.render(widgetRef.current, {
        sitekey: SITE_KEY,
        callback: (t: string) => setToken(t),
        "error-callback": () => setToken(""),
        "expired-callback": () => setToken(""),
      });
    };
    if (window.turnstile) {
      render();
    } else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const captchaReady = !SITE_KEY || token.length > 0;

  async function runGenerate(payload: Record<string, unknown>, src: string | null) {
    setPhase("generating");
    setStage(null);
    setError(null);
    setQuiz(null);
    try {
      const res = await fetch("/api/generate/anon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, turnstileToken: token, ...payload }),
      });
      if (!res.body) throw new Error("No response stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
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
          handleEvent(JSON.parse(line) as GenerateStreamEvent, payload, src);
        }
      }
    } catch {
      setPhase("error");
      setError("Something went wrong. Please try again.");
    }
  }

  function handleEvent(
    evt: GenerateStreamEvent,
    payload: Record<string, unknown>,
    src: string | null,
  ) {
    switch (evt.type) {
      case "stage":
        setStage(evt.stage);
        break;
      case "thin_site":
        setPhase("thin");
        break;
      case "done":
        void saveAndOpen({ title: evt.title, config: evt.config as QuizConfig }, src);
        break;
      case "error":
        // Used-up free generation = the signup funnel: stash the prompt so the
        // homepage replays it after they create an account.
        if (evt.code === "rate_limited") {
          void funnelToSignup({ payload, src });
          return;
        }
        setError(evt.message);
        setPhase("error");
        break;
    }
  }

  // Save under the current (or a fresh guest) session and open the editor.
  async function saveAndOpen(generated: GeneratedQuiz, src: string | null) {
    setQuiz(generated);
    setPhase("saving");
    const id = await saveQuizAsCurrentUser({ quiz: generated, sourceUrl: src });
    if (id) {
      window.location.href = newQuizEditorUrl(id, sessionId);
    } else {
      setPhase("error");
      setError("Your quiz was built, but we couldn't open it. Please try again.");
    }
  }

  function onSubmitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !captchaReady) return;
    setSourceUrl(input.trim());
    void runGenerate({ input }, input.trim());
  }

  function onSubmitDescription(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !captchaReady) return;
    setSourceUrl(null);
    void runGenerate({ input: description }, null);
  }

  const busy = phase === "generating" || phase === "saving";

  return (
    <main className="bg-dreamy min-h-svh px-5 py-12 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <header className="text-center">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
            Free AI quiz generator
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
            Turn your website into a lead-generating quiz.
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm text-ink-600 sm:text-base">
            Paste your link and watch a complete quiz funnel build itself. Free to try, no account needed.
          </p>
        </header>

        <div className="mx-auto mt-8 max-w-xl">
          {inputMode === "url" ? (
            <>
              <form onSubmit={onSubmitUrl} className="glass-lift flex items-center gap-2 rounded-full p-1.5 pl-5" noValidate>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="yourbusiness.com"
                  disabled={busy}
                  className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink-950 outline-none placeholder:text-gray-400"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim() || !captchaReady}
                  className="shrink-0 rounded-full bg-ink-950 px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white shadow-pill transition-all hover:bg-signal-600 active:scale-[0.98] disabled:opacity-40"
                >
                  Build my quiz →
                </button>
              </form>
              <div className="mt-3 text-center">
                <button type="button" onClick={() => setInputMode("text")} disabled={busy} className="text-xs text-ink-500 underline decoration-ink-300 underline-offset-4 transition-colors hover:text-signal-600 disabled:opacity-40">
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
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setInputMode("url")} disabled={busy} className="text-xs text-ink-500 underline decoration-ink-300 underline-offset-4 hover:text-signal-600 disabled:opacity-40">
                    ← Use a URL instead
                  </button>
                  <button type="submit" disabled={busy || !description.trim() || !captchaReady} className="rounded-full bg-ink-950 px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white shadow-pill transition-all hover:bg-signal-600 active:scale-[0.98] disabled:opacity-40">
                    Build my quiz →
                  </button>
                </div>
              </form>
            </>
          )}

          {/* Turnstile bot challenge (renders only if configured) */}
          <div ref={widgetRef} className="mt-4 flex justify-center" />

          {busy && (
            <div className="mt-6 flex items-center justify-center gap-3 text-sm font-medium text-ink-600" aria-live="polite" role="status">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-signal-600" />
              {phase === "saving" ? "Opening your quiz…" : stage ? STAGE_COPY[stage] : "Starting…"}
            </div>
          )}
        </div>

        {phase === "thin" && (
          <p className="mt-8 rounded-[22px] bg-white p-5 text-sm text-ink-600 shadow-soft ring-1 ring-ink-950/5">
            We couldn’t read enough from that link. Try a different URL, or switch to “Describe your business.”
          </p>
        )}

        {phase === "error" && error && (
          <div className="mt-8 rounded-[22px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            {error}
            {quiz ? (
              // Built but not saved — retry without regenerating.
              <div className="mt-3">
                <button
                  onClick={() => void saveAndOpen(quiz, sourceUrl)}
                  className="rounded-full bg-ink-950 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white"
                >
                  Open my quiz →
                </button>
              </div>
            ) : (
              // A blocked/used-up generation routes to signup.
              <div className="mt-3">
                <a href={"/login?next=" + encodeURIComponent("/")} className="rounded-full bg-ink-950 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white">
                  Create a free account →
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
