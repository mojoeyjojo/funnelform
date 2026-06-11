import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuizConfigSchema } from "@/lib/schema";

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
// Required validation gate (build spec §5.4): every outcome must have a
// non-empty, well-formed CTA URL. A blank CTA is a broken funnel. Block + record
// publish_blocked_validation. The AI leaves CTA URLs empty by design, so this is
// the one thing the owner MUST supply.
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

  // Load the saved quiz (RLS-scoped to owner).
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, slug, status, config")
    .eq("id", id)
    .maybeSingle();
  if (!quiz) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const missing = parsed.data.outcomes
    .map((o, i) => ({ i, name: o.name, url: o.cta.url }))
    .filter((o) => !o.url.trim() || !isHttpUrl(o.url.trim()));
  if (missing.length > 0) {
    await supabase.from("builder_events").insert({
      owner_id: user.id,
      quiz_id: id,
      event_type: "publish_blocked_validation",
      metadata: { reason: "missing_cta_url", outcomes: missing.map((m) => m.name) },
    });
    return NextResponse.json(
      {
        error: "Add where this button should send people.",
        reason: "missing_cta_url",
        outcomes: missing,
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
