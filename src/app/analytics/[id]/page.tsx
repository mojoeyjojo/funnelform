import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { QuizConfigSchema } from "@/lib/schema";
import { effectivePlan, fetchPlanProfile, hasProFeatures } from "@/lib/plan";

export const runtime = "nodejs";

// Owner analytics (build spec §5.8). Basic counters for everyone; drop-off by
// question and outcome distribution are Pro. The Pro data is NEVER FETCHED for
// free accounts — they get static locked placeholders, not blurred real
// numbers. All reads go through security-invoker RPCs, so RLS (owner-only)
// governs what can be aggregated.

type CountRow = { event_type: string; count: number };
type FunnelRow = { question_id: string; count: number };
type OutcomeRow = { outcome_id: string; count: number };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft ring-1 ring-ink-950/5">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{value}</p>
    </div>
  );
}

function Bar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="shrink-0 font-mono text-[11px] text-[var(--muted)]">
          {count} · {pct}%
        </p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-signal-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/analytics/${id}`);

  // RLS scopes this to the owner; someone else's quiz id is simply not found.
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, status, slug, config")
    .eq("id", id)
    .maybeSingle();
  if (!quiz) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        <p className="text-sm text-[var(--muted)]">Quiz not found.</p>
      </main>
    );
  }

  const config = QuizConfigSchema.safeParse(quiz.config);
  const plan = effectivePlan(await fetchPlanProfile(supabase, user.id));
  const pro = hasProFeatures(plan);

  // Basic counters: every plan gets these.
  const [{ data: countRows }, { count: leadCount }] = await Promise.all([
    supabase.rpc("quiz_event_counts", { p_quiz_id: id }),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("quiz_id", id),
  ]);
  const counts = new Map<string, number>(
    ((countRows ?? []) as CountRow[]).map((r) => [r.event_type, Number(r.count)]),
  );
  const views = counts.get("view") ?? 0;
  const starts = counts.get("start") ?? 0;
  const completed = counts.get("completed") ?? 0;
  const completionRate = starts > 0 ? Math.round((completed / starts) * 100) : 0;
  const leads = leadCount ?? 0;

  // Pro data: fetched ONLY when the plan allows it.
  let funnel: FunnelRow[] = [];
  let outcomes: OutcomeRow[] = [];
  let leadsByOutcome = new Map<string, number>();
  if (pro) {
    const [funnelRes, outcomeRes, leadRowsRes] = await Promise.all([
      supabase.rpc("quiz_question_funnel", { p_quiz_id: id }),
      supabase.rpc("quiz_outcome_distribution", { p_quiz_id: id }),
      supabase.from("leads").select("outcome_id").eq("quiz_id", id),
    ]);
    funnel = (funnelRes.data ?? []) as FunnelRow[];
    outcomes = (outcomeRes.data ?? []) as OutcomeRow[];
    leadsByOutcome = new Map();
    for (const row of (leadRowsRes.data ?? []) as { outcome_id: string | null }[]) {
      if (!row.outcome_id) continue;
      leadsByOutcome.set(row.outcome_id, (leadsByOutcome.get(row.outcome_id) ?? 0) + 1);
    }
  } else {
    // Server-side paywall instrumentation: a free owner looked at the locked
    // section. Best-effort, never blocks the page.
    await supabase.from("builder_events").insert({
      owner_id: user.id,
      quiz_id: id,
      event_type: "paywall_hit",
      metadata: { trigger: "analytics" },
    });
  }

  const funnelCounts = new Map(funnel.map((r) => [r.question_id, Number(r.count)]));
  const outcomeCounts = new Map(outcomes.map((r) => [r.outcome_id, Number(r.count)]));
  const outcomeName = (oid: string) =>
    config.success ? (config.data.outcomes.find((o) => o.id === oid)?.name ?? oid) : oid;

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <header className="mb-8">
        <Link
          href="/dashboard"
          className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4 hover:text-[var(--signal)]"
        >
          ← Workspace
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
          {quiz.title ?? "Untitled quiz"}
        </h1>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--muted)]">
          Analytics · {quiz.status}
          {quiz.status === "published" && quiz.slug ? (
            <>
              {" · "}
              <a
                href={`/q/${quiz.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--signal)] underline underline-offset-4"
              >
                /q/{quiz.slug}
              </a>
            </>
          ) : null}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Views" value={String(views)} />
        <Stat label="Starts" value={String(starts)} />
        <Stat label="Finished" value={String(completed)} />
        <Stat label="Completion" value={`${completionRate}%`} />
        <Stat label="Leads" value={String(leads)} />
      </div>

      {pro ? (
        <>
          {/* Drop-off by question, anchored on starts. */}
          <section className="mt-8 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink-950/5">
            <h2 className="text-sm font-bold">Drop-off by question</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              How many of your {starts} starter{starts === 1 ? "" : "s"} answered each question.
            </p>
            <div className="mt-4 space-y-4">
              {config.success && config.data.questions.length > 0 ? (
                config.data.questions.map((q, i) => (
                  <Bar
                    key={q.id}
                    label={`${i + 1}. ${q.text}`}
                    count={funnelCounts.get(q.id) ?? 0}
                    total={starts}
                  />
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">No question data yet.</p>
              )}
            </div>
          </section>

          {/* Outcome distribution among finishers. */}
          <section className="mt-5 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink-950/5">
            <h2 className="text-sm font-bold">Outcomes</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Where your {completed} finisher{completed === 1 ? "" : "s"} landed, and how many
              became leads.
            </p>
            <div className="mt-4 space-y-4">
              {outcomes.length > 0 ? (
                [...outcomeCounts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([oid, count]) => (
                    <div key={oid}>
                      <Bar label={outcomeName(oid)} count={count} total={completed} />
                      <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                        {leadsByOutcome.get(oid) ?? 0} lead
                        {(leadsByOutcome.get(oid) ?? 0) === 1 ? "" : "s"} from this outcome
                      </p>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  No completions recorded yet. Outcome tracking starts with the next visitor who
                  finishes the quiz.
                </p>
              )}
            </div>
          </section>
        </>
      ) : (
        // Locked placeholders: static decoration, no real data behind the blur.
        <section className="relative mt-8 overflow-hidden rounded-2xl bg-white p-5 shadow-soft ring-1 ring-ink-950/5">
          <div className="pointer-events-none select-none blur-[6px]" aria-hidden>
            <h2 className="text-sm font-bold">Drop-off by question</h2>
            <div className="mt-4 space-y-4">
              {[82, 64, 51, 43].map((w, i) => (
                <div key={i}>
                  <div className="mb-1 h-3.5 w-2/3 rounded bg-ink-100" />
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-signal-600/60" style={{ width: `${w}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <h2 className="mt-6 text-sm font-bold">Outcomes</h2>
            <div className="mt-4 space-y-4">
              {[58, 31].map((w, i) => (
                <div key={i} className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-signal-600/60" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/55 text-center">
            <p className="max-w-xs text-sm font-semibold">
              See where people drop off and which outcomes convert
            </p>
            <p className="max-w-xs text-xs text-[var(--muted)]">
              Question-by-question drop-off and outcome breakdowns are part of Pro.
            </p>
            <Link
              href="/pricing"
              className="rounded-full bg-ink-950 px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition-all hover:bg-signal-600 active:scale-[0.98]"
            >
              Upgrade to Pro →
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
