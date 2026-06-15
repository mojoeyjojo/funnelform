import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  effectivePlan,
  fetchPlanProfile,
  leadSoftCap,
  monthStartIso,
  type Plan,
} from "@/lib/plan";
import AuthOverlay from "@/components/AuthOverlay";
import WorkspaceQuizzes, { type QuizCard } from "@/components/WorkspaceQuizzes";
import AccountMenu from "@/components/AccountMenu";
import DeleteAccount from "@/components/DeleteAccount";

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
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string; upgraded?: string }>;
}) {
  const { auth, upgraded } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");
  // Guest sessions (anonymous sign-in) see their own quizzes here, Jotform
  // style — but the quizzes live only in this browser until they convert.
  const isGuest = user.is_anonymous === true;
  // ?auth=1 = the rate-limit funnel: a guest hit the daily cap, their prompt
  // is stashed client-side, and signup is mandatory. next="/building" replays
  // the stashed prompt with a progress widget the moment they're a real
  // account, then opens the editor.
  const showAuthOverlay = isGuest && auth === "1";

  const { data } = await supabase
    .from("quizzes")
    .select("id, title, status, slug, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const quizzes = (data ?? []) as QuizRow[];

  // How many quizzes are in the 30-day trash (surfaced as a "Recently deleted"
  // link so the owner can restore or grab leads before they're purged).
  const { count: deletedCount } = await supabase
    .from("quizzes")
    .select("id", { count: "exact", head: true })
    .not("deleted_at", "is", null);

  // Lead counts per quiz (RLS returns only this owner's leads).
  const { data: leadRows } = await supabase.from("leads").select("quiz_id");
  const leadCounts = new Map<string, number>();
  for (const row of leadRows ?? []) {
    const qid = (row as { quiz_id: string }).quiz_id;
    leadCounts.set(qid, (leadCounts.get(qid) ?? 0) + 1);
  }

  // Plan surface (§5.9): badge, trial countdown, billing entry point, and the
  // monthly leads meter. Soft cap only — leads are never blocked.
  let plan: Plan = "free";
  let monthlyLeads = 0;
  let cap = leadSoftCap("free");
  if (!isGuest) {
    const profile = await fetchPlanProfile(supabase, user.id);
    plan = effectivePlan(profile);
    cap = leadSoftCap(plan);
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStartIso());
    monthlyLeads = count ?? 0;
    if (plan === "free" && monthlyLeads >= cap) {
      // Instrumentation: a free account is bumping the soft cap.
      await supabase.from("builder_events").insert({
        owner_id: user.id,
        event_type: "paywall_hit",
        metadata: { trigger: "lead_cap" },
      });
    }
  }
  const planLabel = plan === "pro" ? "Pro" : plan === "growth" ? "Growth" : "Free";
  const isPaid = plan === "pro" || plan === "growth";
  const atCap = plan === "free" && monthlyLeads >= cap;
  const quizCards: QuizCard[] = quizzes.map((q) => ({
    ...q,
    leads: leadCounts.get(q.id) ?? 0,
  }));

  return (
    <div className="min-h-svh">
      {/* Single top bar — brand left, account cluster right. Mobile-first: the
          email + plan badge fold away on small screens, but Upgrade (conversion)
          and Sign out always stay visible. */}
      <header className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3 sm:px-6">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-ink-950">
          Treeflow
        </Link>

        <AccountMenu
          email={user.email ?? null}
          isGuest={isGuest}
          isPaid={isPaid}
          planLabel={planLabel}
        />
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:px-8">
        {upgraded === "1" && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <p className="font-semibold">You&rsquo;re on Pro now.</p>
            <p className="mt-1">
              Branding controls, full analytics, and unlimited live quizzes are unlocked. It can
              take a few seconds for the upgrade to show up here.
            </p>
          </div>
        )}

        {isGuest && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">You’re in guest mode.</p>
            <p className="mt-1">
              Your quizzes are saved to this browser only. Create a free account to keep them
              everywhere, publish, and collect leads.
            </p>
          </div>
        )}

        <WorkspaceQuizzes
          quizzes={quizCards}
          meter={isGuest ? null : { used: monthlyLeads, cap, atCap }}
          deletedCount={deletedCount ?? 0}
        />

        {!isGuest && (
          <div className="mt-16 border-t border-[var(--hairline)] pt-6">
            <DeleteAccount />
          </div>
        )}
      </main>

      {showAuthOverlay && (
        <AuthOverlay
          next="/building"
          mode="convert"
          title="Create your free account"
          subtitle="Sign up and we'll build the quiz you just asked for, automatically."
        />
      )}
    </div>
  );
}
