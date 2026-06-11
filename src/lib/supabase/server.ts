import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

// -----------------------------------------------------------------------------
// Stateless anon client — Phase 1 instrumentation only.
//
// Used by the builder_events writer (no session). RLS stays enabled; the
// tightly-scoped Phase 1 policy lets the anon role touch ONLY owner-less
// builder_events (owner_id IS NULL). Returns null if env isn't configured so
// the app still runs before Supabase is wired up.
// -----------------------------------------------------------------------------
export function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// -----------------------------------------------------------------------------
// Cookie-bound server client — Phase 2 authed contexts (Server Components,
// Server Actions, Route Handlers). The user's session rides in cookies; this
// client reads it so queries run as auth.uid() and RLS scopes every row to the
// owner. Always create a fresh client per request — never share across requests.
//
// `setAll` is wrapped in try/catch: during Server Component render cookies can't
// be written (Next throws). That's fine — `proxy.ts` refreshes the session
// cookie on every request, so the write there is what keeps the session alive.
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Admin client — session-less, secret key (modern service_role). 2B only.
//
// Uses the `sb_secret_…` key which authorizes via the service_role Postgres role
// (BYPASSRLS). CRITICAL: it must carry NO user session — RLS is enforced off the
// Authorization header, so an attached session would override the bypass. Hence
// a plain createClient with persistSession:false and no cookies. SERVER-ONLY.
//
// Use ONLY for anonymous-visitor writes on the public player (leads, quiz_events)
// — never for authed user flows (those stay on the cookie-bound client + RLS).
// -----------------------------------------------------------------------------
export function createSupabaseAdminClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is not configured");
  }
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component (cookies are read-only there).
          // proxy.ts handles the refresh write — safe to ignore.
        }
      },
    },
  });
}
