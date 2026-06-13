"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GenerateStage, GenerateStreamEvent } from "@/lib/types";
import type { GeneratedQuiz, QuizConfig } from "@/lib/schema";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { saveQuizAsCurrentUser, newQuizEditorUrl } from "@/lib/saveQuiz";
import { takePendingPrompt } from "@/lib/pendingPrompt";

// The post-auth landing for the signup funnel: a rate-limited visitor's prompt
// was stashed before auth; this page replays it as the now-permanent user with
// a proper "building your quiz" widget, then opens the editor. Anyone arriving
// without a permanent session or without a stash is sent home.
type Phase = "starting" | "generating" | "saving" | "thin" | "error";

const STAGE_COPY: Record<GenerateStage, string> = {
  reading: "Reading your site…",
  writing: "Writing your quiz…",
  validating: "Building your results…",
};

function newSessionId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sess-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export default function PendingBuild() {
  const [sessionId] = useState(newSessionId);
  const [phase, setPhase] = useState<Phase>("starting");
  const [stage, setStage] = useState<GenerateStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [thinForm, setThinForm] = useState({ whatYouDo: "", whoYouServe: "", mainOffer: "" });
  // src threads through to the eventual save (source_url attribution).
  const srcRef = useRef<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // strict-mode double-mount guard
    started.current = true;
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user || data.user.is_anonymous === true) {
        window.location.replace("/");
        return;
      }
      const pending = takePendingPrompt();
      if (!pending) {
        window.location.replace("/");
        return;
      }
      srcRef.current = pending.src;
      void runGenerate(pending.payload);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runGenerate(payload: Record<string, unknown>) {
    setPhase("generating");
    setStage(null);
    setError(null);
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
          handleStreamEvent(JSON.parse(line) as GenerateStreamEvent);
        }
      }
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
        void saveAndOpen({ title: evt.title, config: evt.config as QuizConfig });
        break;
      case "error":
        // The user here is already permanent, so rate_limited is a real limit
        // (20/day), not the signup funnel — show it.
        setError(evt.message);
        setPhase("error");
        break;
    }
  }

  async function saveAndOpen(generated: GeneratedQuiz) {
    setPhase("saving");
    const id = await saveQuizAsCurrentUser({ quiz: generated, sourceUrl: srcRef.current });
    if (id) {
      window.location.href = newQuizEditorUrl(id, sessionId);
    } else {
      setPhase("error");
      setError("Your quiz was built, but we couldn't open it. Please try again.");
    }
  }

  function onSubmitThin(e: React.FormEvent) {
    e.preventDefault();
    srcRef.current = null;
    void runGenerate({ description: thinForm });
  }

  if (phase === "thin") {
    return (
      <form onSubmit={onSubmitThin} className="space-y-3 text-left">
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
          className="rounded-full bg-ink-950 px-5 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white transition-all hover:bg-signal-600 active:scale-[0.98]"
        >
          Build from this →
        </button>
      </form>
    );
  }

  if (phase === "error" && error) {
    return (
      <div className="text-left">
        <p className="rounded-[22px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-xs font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--signal)]"
        >
          ← Back to the generator
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 text-sm font-medium text-ink-600" aria-live="polite" role="status">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-signal-600" />
      {phase === "saving"
        ? "Opening your quiz…"
        : stage
          ? STAGE_COPY[stage]
          : "Starting…"}
    </div>
  );
}
