import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { QuizConfigSchema } from "@/lib/schema";
import { effectivePlan, fetchPlanProfile, hasProFeatures } from "@/lib/plan";
import QuizPlayer from "@/components/QuizPlayer";

export const runtime = "nodejs";

// Public quiz player (build spec §5.5). SSR, no auth, mobile-first. Reads the
// published quiz via the session-less admin client (scoped columns only — safer
// than a public-read RLS policy that would expose business_context/owner_id of
// every published row). Renderer is schema-driven via config.schema_version.
export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createSupabaseAdminClient();
  const { data: quiz } = await admin
    .from("quizzes")
    .select("id, owner_id, title, config, branding_enabled, lead_capture, delivery, status")
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();

  if (!quiz) notFound();

  // The renderer only ever handles a validated config (never trust stored shape).
  const parsed = QuizConfigSchema.safeParse(quiz.config);
  if (parsed.error) notFound();

  // Watermark enforcement happens HERE, not in the editor toggle (§5.9): a
  // free owner gets the badge no matter what branding_enabled says, so a
  // lapsed trial or canceled Pro can't keep an unbranded quiz live.
  const ownerPlan = effectivePlan(await fetchPlanProfile(admin, quiz.owner_id));
  const branding = hasProFeatures(ownerPlan) ? quiz.branding_enabled !== false : true;

  const placement =
    (quiz.lead_capture as { placement?: string } | null)?.placement === "after_results"
      ? "after_results"
      : "before_results";

  const whatsapp =
    (quiz.delivery as { whatsapp?: string } | null)?.whatsapp ?? null;

  return (
    <QuizPlayer
      quizId={quiz.id}
      title={quiz.title ?? "Take the quiz"}
      config={parsed.data}
      branding={branding}
      placement={placement}
      whatsapp={whatsapp}
    />
  );
}
