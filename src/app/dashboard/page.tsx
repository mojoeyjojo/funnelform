import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type QuizRow = {
  id: string;
  title: string | null;
  status: string;
  slug: string | null;
  created_at: string;
};

// Minimal dashboard (build plan 2A step 4): just the user's saved quizzes —
// title, status, continue editing. No stats/analytics yet. Enough to prove
// persistence and give a landing spot after auth.
export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const { data } = await supabase
    .from("quizzes")
    .select("id, title, status, slug, created_at")
    .order("created_at", { ascending: false });
  const quizzes = (data ?? []) as QuizRow[];

  // Lead counts per quiz (RLS returns only this owner's leads).
  const { data: leadRows } = await supabase.from("leads").select("quiz_id");
  const leadCounts = new Map<string, number>();
  for (const row of leadRows ?? []) {
    const qid = (row as { quiz_id: string }).quiz_id;
    leadCounts.set(qid, (leadCounts.get(qid) ?? 0) + 1);
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
            Funnelform · your quizzes
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
          >
            Sign out
          </button>
        </form>
      </header>

      <Link
        href="/"
        className="inline-block rounded-full bg-[var(--foreground)] px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[var(--signal)]"
      >
        + New quiz
      </Link>

      {quizzes.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-[var(--hairline)] p-6 text-sm text-[var(--muted)]">
          No quizzes yet. Generate one and save it. It’ll show up here.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {quizzes.map((q) => {
            const leads = leadCounts.get(q.id) ?? 0;
            return (
              <li
                key={q.id}
                className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-950/5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">{q.title ?? "Untitled quiz"}</p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
                    {q.status} · {new Date(q.created_at).toLocaleDateString()} ·{" "}
                    <span className="text-[var(--foreground)]">{leads} lead{leads === 1 ? "" : "s"}</span>
                  </p>
                  {q.status === "published" && q.slug && (
                    <a
                      href={`/q/${q.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block break-all text-xs text-[var(--signal)] underline underline-offset-4"
                    >
                      /q/{q.slug}
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {leads > 0 && (
                    <Link
                      href={`/leads/${q.id}`}
                      className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
                    >
                      View leads
                    </Link>
                  )}
                  <Link
                    href={`/edit/${q.id}`}
                    className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
                  >
                    Edit →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
