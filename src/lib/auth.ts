import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase/server";

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

// Open-redirect guard for the post-auth `next` param (attacker-controllable via
// the callback/login URL). Only allow strictly-local paths: a single leading
// slash, never protocol-relative (`//…`) or backslash tricks (`/\…`), so it can
// never bounce the user off-site (e.g. `@evil.com`, `https://evil.com`). Always
// resolve with `new URL(path, origin)` at the call site, never string concat.
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/dashboard";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/dashboard";
  return next;
}

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
 * Called from BOTH the auth callback (OAuth/magic-link round-trip) and the
 * first quiz save (guest sessions via signInAnonymously never hit the
 * callback). Idempotent. For guests, email is null; when a guest converts to a
 * permanent account (updateUser/linkIdentity), the same user id gains an email,
 * so we backfill it onto the existing profile row here.
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
    .select("id, email")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) {
    // Guest → permanent conversion: same profile row, now with an email.
    if (!existing.email && user.email) {
      await supabase
        .from("profiles")
        .update({ email: user.email, updated_at: new Date().toISOString() })
        .eq("id", user.id);
    }
    return;
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(SIGNUP_SOURCE_COOKIE)?.value ?? "direct";
  const signupSource = VALID_SOURCES.has(raw) ? raw : "other";

  // Everyone starts on the free floor. Pro trials are opt-in and live in
  // Stripe (card-upfront trial on the subscription itself), not here — the
  // webhook flips the plan when a trial/subscription starts.
  const { error } = await supabase.from("profiles").insert({
    id: user.id, // MUST equal auth.uid() — not the table default
    email: user.email,
    plan: "free",
    signup_source: signupSource,
  });
  if (error) {
    // Don't block auth on profile creation; log for visibility.
    console.error("[auth] profile creation failed:", error.message);
  }
}
