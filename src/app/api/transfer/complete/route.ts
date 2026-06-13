import { NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { verifyTransferToken } from "@/lib/transferToken";

export const runtime = "nodejs";

// POST /api/transfer/complete { token } — move a guest's quizzes to the caller.
//
// The token (from /api/transfer/start) proves this browser controlled guest
// user `fromId`. The destination is ALWAYS the caller's authenticated user id,
// never read from the token, so the transfer can't be redirected. Requires a
// permanent session: an anonymous caller could otherwise shuffle rows between
// throwaway users.
//
// Order matters: quizzes.owner_id and leads.owner_id both FK profiles(id)
// ON DELETE CASCADE — reassign FIRST, delete the guest profile AFTER, or the
// cascade would eat the very quizzes we're moving. Every step is idempotent
// and the token stays valid for 1h, so a mid-sequence failure is retryable.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous === true) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let token: unknown;
  try {
    token = ((await request.json()) as { token?: unknown }).token;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof token !== "string") {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const fromId = verifyTransferToken(token);
  if (!fromId) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  // Normal convert path: the guest UPGRADED into this very user. Nothing to
  // move — the quizzes already belong to them.
  if (fromId === user.id) {
    return NextResponse.json({ transferred: false });
  }

  const admin = createSupabaseAdminClient();

  const { error: quizErr } = await admin
    .from("quizzes")
    .update({ owner_id: user.id })
    .eq("owner_id", fromId);
  if (quizErr) {
    console.error("[transfer] quiz reassignment failed:", quizErr.message);
    return NextResponse.json({ error: "Transfer failed" }, { status: 500 });
  }

  // leads.owner_id is denormalized for RLS; it must follow the quizzes.
  const { error: leadErr } = await admin
    .from("leads")
    .update({ owner_id: user.id })
    .eq("owner_id", fromId);
  if (leadErr) {
    console.error("[transfer] lead reassignment failed:", leadErr.message);
    return NextResponse.json({ error: "Transfer failed" }, { status: 500 });
  }

  // Cleanup is best-effort: the quizzes are already safe with their new owner.
  const { error: profileErr } = await admin.from("profiles").delete().eq("id", fromId);
  if (profileErr) console.error("[transfer] guest profile cleanup failed:", profileErr.message);
  const { error: userErr } = await admin.auth.admin.deleteUser(fromId);
  if (userErr) console.error("[transfer] guest user cleanup failed:", userErr.message);

  return NextResponse.json({ transferred: true });
}
