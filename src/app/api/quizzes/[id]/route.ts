import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuizConfigSchema } from "@/lib/schema";

export const runtime = "nodejs";

// Editor persistence: PATCH a draft's title and/or config. Both are re-validated
// (config against the versioned quiz_config contract) before the write. RLS
// guarantees a user can only update their own rows.
const UpdateQuizSchema = z
  .object({
    title: z.string().min(1).optional(),
    config: QuizConfigSchema.optional(),
  })
  .refine((v) => v.title !== undefined || v.config !== undefined, {
    message: "Nothing to update",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const parsed = UpdateQuizSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { data, error } = await supabase
    .from("quizzes")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, title, status, updated_at")
    .single();

  if (error) {
    console.error("[quizzes] update failed:", error.message);
    return NextResponse.json({ error: "Could not update quiz" }, { status: 500 });
  }
  return NextResponse.json({ quiz: data });
}

// GET /api/quizzes/[id] — fetch one quiz (RLS-scoped to owner).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("quizzes")
    .select("id, title, status, slug, config, source_url, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ quiz: data });
}
