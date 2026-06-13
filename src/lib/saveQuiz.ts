"use client";

import type { GeneratedQuiz } from "@/lib/schema";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// Jotform-style flow: every generated quiz is saved immediately and opened in
// the editor. Visitors without an account get a silent guest session
// (signInAnonymously) — their quizzes are real rows owned by that guest user,
// tied to this browser's session cookie. Creating an account later upgrades
// the SAME user (updateUser / linkIdentity), so the quizzes come along free.
//
// Returns the new quiz id, or null on failure (caller shows a retry).
export async function saveQuizAsCurrentUser(args: {
  quiz: GeneratedQuiz;
  sourceUrl?: string | null;
}): Promise<string | null> {
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      // Requires "Allow anonymous sign-ins" in Supabase Auth settings.
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.error("[guest] anonymous sign-in failed:", error.message);
        return null;
      }
    }

    const res = await fetch("/api/quizzes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: args.quiz.title,
        config: args.quiz.config,
        source_url: args.sourceUrl ?? undefined,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { quiz?: { id?: string } };
    return data.quiz?.id ?? null;
  } catch {
    return null;
  }
}

/** Editor URL for a just-generated quiz: shows the first-impression rating bar
 *  and keeps builder_events linked to the generating session. */
export function newQuizEditorUrl(id: string, sessionId: string): string {
  return `/edit/${id}?new=1&sid=${encodeURIComponent(sessionId)}`;
}
