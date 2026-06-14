import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuizConfigSchema } from "@/lib/schema";
import { effectivePlan, fetchPlanProfile, hasProFeatures } from "@/lib/plan";

export const runtime = "nodejs";

// Editor persistence: PATCH a draft's title, config, WhatsApp delivery number,
// and/or the branding toggle. config is re-validated against the versioned
// quiz_config contract. `whatsapp` is stored in the `delivery` jsonb (empty
// string clears it). `branding_enabled: false` is a Pro feature (§5.9) — and
// the player enforces the watermark server-side regardless, so this gate is
// UX, not security. RLS guarantees a user can only update their own rows.
const UpdateQuizSchema = z
  .object({
    title: z.string().min(1).optional(),
    config: QuizConfigSchema.optional(),
    whatsapp: z.string().max(32).optional(),
    branding_enabled: z.boolean().optional(),
    // Brand color: a hex string, or null to clear back to the neutral default.
    theme_accent: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.config !== undefined ||
      v.whatsapp !== undefined ||
      v.branding_enabled !== undefined ||
      v.theme_accent !== undefined,
    { message: "Nothing to update" },
  );

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

  // Turning the watermark OFF requires Pro (turning it back ON is always fine).
  if (parsed.data.branding_enabled === false) {
    const plan = effectivePlan(await fetchPlanProfile(supabase, user.id));
    if (!hasProFeatures(plan)) {
      await supabase.from("builder_events").insert({
        owner_id: user.id,
        quiz_id: id,
        event_type: "paywall_hit",
        metadata: { trigger: "branding" },
      });
      return NextResponse.json(
        {
          error: "Removing Treeflow branding is a Pro feature.",
          reason: "plan_required",
        },
        { status: 403 },
      );
    }
  }

  // Build the column update explicitly — `whatsapp` maps into the delivery jsonb,
  // it is not its own column, so it must not be spread in.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.config !== undefined) update.config = parsed.data.config;
  if (parsed.data.branding_enabled !== undefined) update.branding_enabled = parsed.data.branding_enabled;
  if (parsed.data.theme_accent !== undefined) update.theme_accent = parsed.data.theme_accent;
  if (parsed.data.whatsapp !== undefined) {
    const w = parsed.data.whatsapp.trim();
    update.delivery = w ? { whatsapp: w } : {};
  }

  const { data, error } = await supabase
    .from("quizzes")
    .update(update)
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
    .select("id, title, status, slug, config, source_url, delivery, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ quiz: data });
}

// DELETE /api/quizzes/[id] — soft delete. Stamps deleted_at, which drops the
// quiz from the workspace and takes it offline (player + lead capture filter on
// deleted_at), but the row and its leads survive a 30-day grace period (see the
// purge cron) so an accidental delete is recoverable. RLS scopes this to owner.
export async function DELETE(
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

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("quizzes")
    .update({ deleted_at: now, updated_at: now })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) {
    console.error("[quizzes] soft delete failed:", error.message);
    return NextResponse.json({ error: "Could not delete quiz" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
