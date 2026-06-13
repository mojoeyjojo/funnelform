import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type LeadRow = {
  id: string;
  email: string | null;
  phone: string | null;
  outcome_id: string | null;
  created_at: string;
};

// Captured-leads view (RLS-scoped to the owner via leads_owner). Enough to *see*
// the lead landed — full drop-off analytics is the spec's Phase 3 §5.8.
export default async function LeadsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Lead data is for verified accounts ONLY. Guests are redirected before any
  // lead row renders (not even behind an overlay); /login doubles as their
  // conversion flow and brings them back here.
  if (!user || user.is_anonymous) redirect(`/login?next=/leads/${id}`);

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();

  const { data } = await supabase
    .from("leads")
    .select("id, email, phone, outcome_id, created_at")
    .eq("quiz_id", id)
    .order("created_at", { ascending: false });
  const leads = (data ?? []) as LeadRow[];

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--signal)]"
        >
          ← Workspace
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
          Leads: {quiz?.title ?? "quiz"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{leads.length} captured</p>
      </header>

      {leads.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--hairline)] p-6 text-sm text-[var(--muted)]">
          No leads yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {leads.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-950/5 text-sm"
            >
              <div>
                <p className="font-semibold">{l.email}</p>
                {l.phone && <p className="text-xs text-[var(--muted)]">{l.phone}</p>}
              </div>
              <div className="text-right">
                {l.outcome_id && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted)]">
                    {l.outcome_id}
                  </p>
                )}
                <p className="text-xs text-[var(--muted)]">
                  {new Date(l.created_at).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
