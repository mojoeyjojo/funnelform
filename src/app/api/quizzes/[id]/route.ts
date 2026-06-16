import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuizConfigSchema } from "@/lib/schema";
import { effectivePlan, fetchPlanProfile, hasProFeatures } from "@/lib/plan";
import { isWellFormedWebhookUrl } from "@/lib/ssrf";

export const runtime = "nodejs";

// Per-outcome follow-up email config, stored inside the delivery jsonb.
const FollowUpSchema = z.object({
  enabled: z.boolean(),
  sender: z.object({ mode: z.enum(["subdomain", "custom_domain"]) }),
  outcomes: z.record(
    z.string(),
    z.object({ subject: z.string().max(200), body: z.string().max(20000) }),
  ),
});

// Per-quiz ESP destinations: push captured leads to a connected list/form.
// Stored inside the delivery jsonb as `destinations`. Maximum 5 per quiz.
const DestinationsSchema = z
  .array(
    z.object({
      integrationId: z.string().uuid(),
      provider: z.enum(["kit", "mailchimp", "mailerlite", "brevo"]),
      targetId: z.string().min(1),
      targetName: z.string().max(200),
    }),
  )
  .max(5);

// Editor persistence: PATCH a draft's title, config, WhatsApp delivery number,
// and/or the branding toggle. config is re-validated against the versioned
// quiz_config contract. `whatsapp` is stored in the `delivery` jsonb (empty
// string clears it). `branding_enabled: false` is a Pro feature (§5.9), and
// the player enforces the watermark server-side regardless, so this gate is
// UX, not security. RLS guarantees a user can only update their own rows.
const UpdateQuizSchema = z
  .object({
    title: z.string().min(1).optional(),
    config: QuizConfigSchema.optional(),
    whatsapp: z.string().max(32).optional(),
    webhook: z.string().max(2000).optional(),
    branding_enabled: z.boolean().optional(),
    // Brand color: a hex string, or null to clear back to the neutral default.
    theme_accent: z
      .string()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
      .nullable()
      .optional(),
    followUp: FollowUpSchema.optional(),
    destinations: DestinationsSchema.optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.config !== undefined ||
      v.whatsapp !== undefined ||
      v.webhook !== undefined ||
      v.branding_enabled !== undefined ||
      v.theme_accent !== undefined ||
      v.followUp !== undefined ||
      v.destinations !== undefined,
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

  // Authorization: every destination's integration must belong to the caller,
  // and its provider must match. RLS already scopes this select to the owner;
  // the explicit eq is defense in depth. Prevents pointing a quiz at another
  // owner's ESP connection (cross-tenant abuse).
  if (parsed.data.destinations && parsed.data.destinations.length > 0) {
    const ids = parsed.data.destinations.map((d) => d.integrationId);
    const { data: owned } = await supabase
      .from("integrations")
      .select("id, provider")
      .in("id", ids)
      .eq("owner_id", user.id);
    const ownedProvider = new Map((owned ?? []).map((r) => [r.id as string, r.provider as string]));
    const bad = parsed.data.destinations.some((d) => ownedProvider.get(d.integrationId) !== d.provider);
    if (bad) {
      return NextResponse.json({ error: "Unknown or unauthorized integration." }, { status: 422 });
    }
  }

  // Build the column update explicitly. `whatsapp` and `webhook` both map into
  // the delivery jsonb, they are not their own columns, so they must not be
  // spread in. The editor sends both current values on save, so a full rebuild
  // is correct and neither field clobbers the other.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.config !== undefined) update.config = parsed.data.config;
  if (parsed.data.branding_enabled !== undefined) update.branding_enabled = parsed.data.branding_enabled;
  if (parsed.data.theme_accent !== undefined) update.theme_accent = parsed.data.theme_accent;
  if (
    parsed.data.whatsapp !== undefined ||
    parsed.data.webhook !== undefined ||
    parsed.data.followUp !== undefined ||
    parsed.data.destinations !== undefined
  ) {
    const delivery: Record<string, unknown> = {};
    const w = (parsed.data.whatsapp ?? "").trim();
    const hook = (parsed.data.webhook ?? "").trim();
    if (w) delivery.whatsapp = w;
    if (hook) {
      // Reject an unsafe webhook at store time (https only, no IP-literal in a
      // private range). The send path re-checks via DNS; this is fast feedback.
      if (!isWellFormedWebhookUrl(hook)) {
        return NextResponse.json(
          { error: "Webhook must be a valid https URL (not a local or private address)." },
          { status: 422 },
        );
      }
      delivery.webhook = hook;
    }
    if (parsed.data.followUp !== undefined) delivery.followUp = parsed.data.followUp;
    if (parsed.data.destinations !== undefined) delivery.destinations = parsed.data.destinations;
    update.delivery = delivery;
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

// GET /api/quizzes/[id]: fetch one quiz (RLS-scoped to owner).
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

// DELETE /api/quizzes/[id]: soft delete. Stamps deleted_at, which drops the
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
