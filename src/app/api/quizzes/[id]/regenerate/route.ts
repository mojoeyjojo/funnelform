import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuizConfigSchema } from "@/lib/schema";
import { regenerateQuestion, regenerateOutcome } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/quizzes/[id]/regenerate — the §5.3 single-item reroll. Rewrites the
// COPY of one question or one outcome with a cheap Haiku call and returns it; the
// editor merges the new wording onto the existing item, preserving the hidden
// logic (option tags/score, outcome match_logic, cta.url). RLS scopes to owner.
const Body = z.object({
  target: z.enum(["question", "outcome"]),
  index: z.number().int().min(0),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }
  const { target, index } = parsed.data;

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("title, config, business_context")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!quiz) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const config = QuizConfigSchema.safeParse(quiz.config);
  if (!config.success) {
    return NextResponse.json({ error: "Quiz data is invalid" }, { status: 422 });
  }

  // Ground the reroll in the original business context; fall back to the title so
  // older quizzes (no stored context) still regenerate on-theme.
  const context =
    (typeof quiz.business_context === "string" && quiz.business_context.trim()) ||
    `Quiz title: "${quiz.title ?? "Untitled quiz"}"`;

  try {
    if (target === "question") {
      const question = config.data.questions[index];
      if (!question) {
        return NextResponse.json({ error: "No such question" }, { status: 422 });
      }
      const result = await regenerateQuestion(context, {
        text: question.text,
        options: question.options.map((o) => ({ label: o.label, tags: o.tags })),
      });
      return NextResponse.json(result);
    }

    const outcome = config.data.outcomes[index];
    if (!outcome) {
      return NextResponse.json({ error: "No such outcome" }, { status: 422 });
    }
    const result = await regenerateOutcome(context, {
      name: outcome.name,
      description: outcome.description,
      recommendations: outcome.recommendations,
      ctaLabel: outcome.cta.label,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[regenerate] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "regenerate_failed" }, { status: 502 });
  }
}
