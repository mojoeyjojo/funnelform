import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuizConfigSchema } from "@/lib/schema";
import EditQuizClient from "@/components/EditQuizClient";

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
    .select("id, title, config, status, slug")
    .eq("id", id)
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

  return (
    <EditQuizClient
      id={data.id}
      initialTitle={data.title ?? ""}
      initialConfig={parsed.data}
      initialStatus={data.status ?? "draft"}
      initialSlug={data.slug ?? null}
    />
  );
}
