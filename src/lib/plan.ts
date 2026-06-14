import type { SupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// Plan logic (build spec §5.9). One rule above all: the `profiles.plan` column
// is written ONLY by the Stripe webhook ('pro' on subscribe, 'free' on cancel).
// Trial expiry is never written anywhere — it is COMPUTED at read time from
// trial_ends_at, so there is no cron and no stale-plan window. Everything that
// gates a feature must go through effectivePlan(), never the raw column.
// =============================================================================

export type Plan = "trial" | "free" | "pro" | "growth";

export type PlanProfile = {
  plan: Plan;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
};

// LEGACY: the launch model was a reverse trial ('trial' = full Pro until
// trial_ends_at, then quietly 'free' with no DB write). Replaced 2026-06-12 by
// the opt-in Stripe trial (card-upfront trial on the subscription; Stripe
// reports 'trialing' and the webhook writes plain 'pro'). New signups are
// 'free'; this decay path only still matters for any pre-switch 'trial' rows.
export function effectivePlan(profile: Pick<PlanProfile, "plan" | "trial_ends_at"> | null): Plan {
  if (!profile) return "free";
  if (profile.plan === "trial") {
    if (!profile.trial_ends_at) return "trial";
    return new Date(profile.trial_ends_at).getTime() > Date.now() ? "trial" : "free";
  }
  return profile.plan;
}

export function hasProFeatures(plan: Plan): boolean {
  return plan === "trial" || plan === "pro" || plan === "growth";
}

// Lead soft caps (§5.9): DISPLAY ONLY. Treeflow never blocks a lead from
// being captured — the cap is a usage meter that nudges toward upgrading.
export function leadSoftCap(plan: Plan): number {
  return hasProFeatures(plan) ? 1000 : 100;
}

// Start of the current calendar month (UTC) for "leads this month" queries.
export function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

// Fetch the billing-relevant slice of a profile. Works with both the
// cookie-bound client (RLS: own row only) and the admin client.
export async function fetchPlanProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlanProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("plan, trial_ends_at, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  return (data as PlanProfile | null) ?? null;
}
