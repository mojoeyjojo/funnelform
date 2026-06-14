import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { trashDaysLeft } from "@/lib/trash";

export const runtime = "nodejs";

type DeletedRow = {
  id: string;
  title: string | null;
  deleted_at: string;
};

const PILL =
  "rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]";

// Recently deleted (trash). Soft-deleted quizzes live here for 30 days before
// the purge cron removes them for good. Owners can restore (returns as a draft)
// or grab the leads as CSV first. Guests have no persistent trash — they're sent
// to sign in.
export default async function DeletedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect("/login?next=/deleted");

  const { data } = await supabase
    .from("quizzes")
    .select("id, title, deleted_at")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  const quizzes = (data ?? []) as DeletedRow[];

  // Lead counts per quiz (RLS returns only this owner's leads).
  const { data: leadRows } = await supabase.from("leads").select("quiz_id");
  const leadCounts = new Map<string, number>();
  for (const row of leadRows ?? []) {
    const qid = (row as { quiz_id: string }).quiz_id;
    leadCounts.set(qid, (leadCounts.get(qid) ?? 0) + 1);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--signal)]"
        >
          ← Workspace
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Recently deleted</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Deleted quizzes stay here for 30 days, then they&rsquo;re removed for good along with their
          leads. Restore one to bring it back as a draft.
        </p>
      </header>

      {quizzes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--hairline)] p-6 text-sm text-[var(--muted)]">
          Nothing here. Quizzes you delete show up for 30 days before they&rsquo;re gone for good.
        </p>
      ) : (
        <ul className="space-y-3">
          {quizzes.map((q) => {
            const leads = leadCounts.get(q.id) ?? 0;
            const left = trashDaysLeft(q.deleted_at);
            return (
              <li
                key={q.id}
                className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-950/5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">{q.title ?? "Untitled quiz"}</p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
                    deletes in {left} day{left === 1 ? "" : "s"} ·{" "}
                    <span className="text-[var(--foreground)]">
                      {leads} lead{leads === 1 ? "" : "s"}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {leads > 0 && (
                    <a href={`/api/leads/${q.id}/export`} className={PILL}>
                      Download CSV
                    </a>
                  )}
                  <form action={`/api/quizzes/${q.id}/restore`} method="post">
                    <button
                      type="submit"
                      className="rounded-full bg-[var(--foreground)] px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[var(--signal)]"
                    >
                      Restore
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
