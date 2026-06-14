import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuizConfigSchema } from "@/lib/schema";
import { effectivePlan, fetchPlanProfile, hasProFeatures } from "@/lib/plan";

export const runtime = "nodejs";

// Slugify a title into a URL-safe base, then append a short random suffix for
// uniqueness. ASCII-fold + strip non-alphanumerics.
function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "quiz"}-${suffix}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// POST /api/quizzes/[id]/publish — validate, mint a slug, go live.
//
// Validation gate: CTA URLs are optional (lead capture is the guaranteed
// conversion), but any URL that IS provided must be well-formed. A malformed
// link blocks publish + records publish_blocked_validation.
export async function POST(
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
  // Guests can build and edit, but publishing (= going live + collecting
  // leads) requires a real account. RLS enforces this too (0003); this gives
  // the client a clean reason to route into the conversion flow.
  if (user.is_anonymous) {
    return NextResponse.json(
      { error: "Create a free account to publish", reason: "guest" },
      { status: 403 },
    );
  }

  // Load the saved quiz (RLS-scoped to owner).
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, slug, status, config")
    .eq("id", id)
    .maybeSingle();
  if (!quiz) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Plan gate (§5.9): Free = one LIVE quiz. Grandfathered on purpose: a quiz
  // that is already published (or was, and kept its slug while this one is the
  // one being re-published) stays re-publishable. The gate only fires when
  // taking an ADDITIONAL quiz live while another is already live.
  if (quiz.status !== "published") {
    const plan = effectivePlan(await fetchPlanProfile(supabase, user.id));
    if (!hasProFeatures(plan)) {
      const { count } = await supabase
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .neq("id", id);
      if ((count ?? 0) >= 1) {
        await supabase.from("builder_events").insert({
          owner_id: user.id,
          quiz_id: id,
          event_type: "paywall_hit",
          metadata: { trigger: "second_quiz" },
        });
        return NextResponse.json(
          {
            error: "The free plan includes one live quiz. Upgrade to publish more.",
            reason: "plan_limit",
          },
          { status: 403 },
        );
      }
    }
  }

  await supabase.from("builder_events").insert({
    owner_id: user.id,
    quiz_id: id,
    event_type: "publish_attempted",
  });

  // Validate the stored config + the CTA-URL publish gate.
  const parsed = QuizConfigSchema.safeParse(quiz.config);
  if (!parsed.success) {
    const reason = "invalid_config";
    await supabase.from("builder_events").insert({
      owner_id: user.id,
      quiz_id: id,
      event_type: "publish_blocked_validation",
      metadata: { reason },
    });
    return NextResponse.json({ error: "Quiz data is invalid", reason }, { status: 422 });
  }

  // CTA URLs are OPTIONAL: a no-website owner (e.g. an Instagram-run business)
  // can rely on lead capture alone and follow up from the workspace. But any URL
  // that IS filled in must be a real http(s) link, so a published button never
  // points at garbage. Empty = fine, malformed = blocked.
  const invalid = parsed.data.outcomes
    .map((o, i) => ({ i, name: o.name, url: o.cta.url.trim() }))
    .filter((o) => o.url.length > 0 && !isHttpUrl(o.url));
  if (invalid.length > 0) {
    await supabase.from("builder_events").insert({
      owner_id: user.id,
      quiz_id: id,
      event_type: "publish_blocked_validation",
      metadata: { reason: "invalid_cta_url", outcomes: invalid.map((m) => m.name) },
    });
    return NextResponse.json(
      {
        error: "One or more button links aren't valid web addresses.",
        reason: "invalid_cta_url",
        outcomes: invalid,
      },
      { status: 422 },
    );
  }

  // Mint a unique slug (retry on the unique constraint), publish.
  let slug = quiz.slug as string | null;
  for (let attempt = 0; attempt < 5 && !slug; attempt++) {
    const candidate = slugify(quiz.title ?? "quiz");
    const { error } = await supabase
      .from("quizzes")
      .update({
        slug: candidate,
        status: "published",
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (!error) {
      slug = candidate;
    } else if (!error.message.toLowerCase().includes("duplicate")) {
      console.error("[publish] update failed:", error.message);
      return NextResponse.json({ error: "Could not publish" }, { status: 500 });
    }
  }

  // Already had a slug (re-publish) — just flip status.
  if (quiz.slug) {
    await supabase
      .from("quizzes")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", id);
  }

  if (!slug) {
    return NextResponse.json({ error: "Could not generate a unique link" }, { status: 500 });
  }

  await supabase.from("builder_events").insert({
    owner_id: user.id,
    quiz_id: id,
    event_type: "published",
    metadata: { slug },
  });

  return NextResponse.json({ slug, status: "published" });
}

// DELETE /api/quizzes/[id]/publish — take a live quiz offline. The slug, leads,
// and published_at are all kept, so re-publishing restores the SAME public URL
// with no data loss. This frees the free plan's single "live quiz" slot so the
// owner can take a different one live, and lets any owner pause a funnel.
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
  if (user.is_anonymous) {
    return NextResponse.json({ error: "Not allowed", reason: "guest" }, { status: 403 });
  }

  // RLS-scoped to the owner; a foreign id simply returns nothing.
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!quiz) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Idempotent: unpublishing a quiz that isn't live is a no-op success.
  if (quiz.status === "published") {
    const { error } = await supabase
      .from("quizzes")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[unpublish] update failed:", error.message);
      return NextResponse.json({ error: "Could not unpublish" }, { status: 500 });
    }
    await supabase.from("builder_events").insert({
      owner_id: user.id,
      quiz_id: id,
      event_type: "unpublished",
    });
  }

  return NextResponse.json({ status: "draft" });
}
