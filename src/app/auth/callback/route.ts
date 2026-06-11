import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureProfile, safeNextPath } from "@/lib/auth";

export const runtime = "nodejs";

// Auth callback for both magic-link and OAuth (Google, drop-in). Supabase
// redirects here with a `code`; we exchange it for a session, ensure the
// profile exists (stamping attribution + trial), then continue to `next`.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` is attacker-controllable — validate it's strictly local before use.
  const safeNext = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await ensureProfile(supabase);
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", origin));
}
