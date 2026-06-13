import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/auth";
import { GeneratedQuizSchema } from "@/lib/schema";

export const runtime = "nodejs";

// Payload for persisting a generated quiz as a draft. We re-validate the quiz
// envelope ({ title, config }) server-side — never store unvalidated output.
const CreateQuizSchema = GeneratedQuizSchema.extend({
  source_url: z.string().optional(),
  business_context: z.string().optional(),
});

// POST /api/quizzes — create a draft quiz owned by the current user.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateQuizSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Quiz failed validation", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Guest sessions (signInAnonymously) never pass through the auth callback,
  // so the profile row (quizzes.owner_id FK target) is created here on first
  // save. Idempotent for everyone else.
  await ensureProfile(supabase);

  const { title, config, source_url, business_context } = parsed.data;
  const { data, error } = await supabase
    .from("quizzes")
    .insert({
      owner_id: user.id, // RLS check: auth.uid() = owner_id
      status: "draft",
      title,
      config,
      source_url: source_url ?? null,
      business_context: business_context ?? null,
    })
    .select("id, title, status, created_at")
    .single();

  if (error) {
    console.error("[quizzes] create failed:", error.message);
    return NextResponse.json({ error: "Could not save quiz" }, { status: 500 });
  }
  return NextResponse.json({ quiz: data }, { status: 201 });
}

// GET /api/quizzes — list the current user's quizzes (RLS-scoped).
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("quizzes")
    .select("id, title, status, slug, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[quizzes] list failed:", error.message);
    return NextResponse.json({ error: "Could not load quizzes" }, { status: 500 });
  }
  return NextResponse.json({ quizzes: data ?? [] });
}
