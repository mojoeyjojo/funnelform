import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (Client Components). Uses the publishable/anon
// key; the user's session lives in cookies (managed by @supabase/ssr) and RLS
// enforces per-user access via auth.uid(). Cookie handling is automatic in the
// browser — no custom cookie methods needed.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
