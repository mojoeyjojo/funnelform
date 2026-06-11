import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase/server";

const TRIAL_DAYS = 14;

// Cookie that carries acquisition attribution across the OAuth/magic-link
// round-trip (Claim 5 instrumentation). Set client-side from UTM/referrer
// before auth; read here in the callback to stamp the profile. Fails silently
// if absent → "direct".
export const SIGNUP_SOURCE_COOKIE = "ff_signup_source";

// Allowed signup_source values (matches the migration's column comment).
const VALID_SOURCES = new Set([
  "free_tool",
  "comparison",
  "niche_page",
  "founder",
  "direct",
  "other",
]);

/** The verified current user, or null. Use this (not getSession) for auth. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Create the profile row on first login if it doesn't exist yet. Done
 * app-level (not a DB trigger) precisely because the attribution cookie is only
 * readable here — a trigger on auth.users couldn't see it (Claim 5).
 *
 * CRITICAL: id is set to auth.uid() explicitly, overriding the table's
 * gen_random_uuid() default. RLS is `auth.uid() = id` and quizzes.owner_id FKs
 * to profiles.id under `auth.uid() = owner_id`; letting id default would
 * silently break both.
 */
export async function ensureProfile(supabase: SupabaseClient): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) return;

  const cookieStore = await cookies();
  const raw = cookieStore.get(SIGNUP_SOURCE_COOKIE)?.value ?? "direct";
  const signupSource = VALID_SOURCES.has(raw) ? raw : "other";
  const trialEndsAt = new Date(
    Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await supabase.from("profiles").insert({
    id: user.id, // MUST equal auth.uid() — not the table default
    email: user.email,
    plan: "trial",
    trial_ends_at: trialEndsAt,
    signup_source: signupSource,
  });
  if (error) {
    // Don't block auth on profile creation; log for visibility.
    console.error("[auth] profile creation failed:", error.message);
  }
}
