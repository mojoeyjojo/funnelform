import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuizConfigSchema } from "@/lib/schema";
import { effectivePlan, fetchPlanProfile, hasProFeatures } from "@/lib/plan";
import EditQuizClient from "@/components/EditQuizClient";
import AuthOverlay from "@/components/AuthOverlay";
import type { FollowUpConfig } from "@/lib/delivery/templates";

export const runtime = "nodejs";

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/edit/${id}`);

  const { data } = await supabase
    .from("quizzes")
    .select("id, title, config, status, slug, delivery, branding_enabled, theme_accent")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        <p className="text-sm text-[var(--muted)]">Quiz not found.</p>
      </main>
    );
  }

  // Validate the stored config before handing it to the editor (never trust
  // stored shape blindly — the renderer depends on the contract).
  const parsed = QuizConfigSchema.safeParse(data.config);
  if (!parsed.success) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        <p className="text-sm text-rose-700">This quiz’s data is invalid and can’t be edited.</p>
      </main>
    );
  }

  const initialWhatsapp =
    (data.delivery as { whatsapp?: string } | null)?.whatsapp ?? "";
  const isGuest = user.is_anonymous === true;

  // Plan drives the branding-toggle card (Pro feature, §5.9). The watermark
  // itself is enforced server-side in /q/[slug]; this is just honest UI.
  const plan = effectivePlan(await fetchPlanProfile(supabase, user.id));

  return (
    <>
      <EditQuizClient
        id={data.id}
        initialTitle={data.title ?? ""}
        initialConfig={parsed.data}
        initialStatus={data.status ?? "draft"}
        initialSlug={data.slug ?? null}
        initialWhatsapp={initialWhatsapp}
        initialWebhook={(data.delivery as { webhook?: string } | null)?.webhook ?? ""}
        initialBranding={data.branding_enabled !== false}
        initialAccent={(data.theme_accent as string | null) ?? null}
        initialFollowUp={
          (data.delivery as { followUp?: FollowUpConfig } | null)?.followUp ?? {
            enabled: false,
            sender: { mode: "subdomain" },
            outcomes: {},
          }
        }
        hasPro={hasProFeatures(plan)}
        isGuest={isGuest}
      />
      {/* Editing is account-walled: guests see their quiz behind a mandatory
          signup overlay. Converting links an identity to the SAME user, so the
          quiz is still theirs when the overlay clears. */}
      {isGuest && (
        <AuthOverlay
          next={`/edit/${data.id}`}
          mode="convert"
          title="Your quiz is ready"
          subtitle="Sign up free to edit it, publish it, and collect leads."
        />
      )}
    </>
  );
}
