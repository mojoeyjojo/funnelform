import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

// DELETE /api/account — GDPR erasure. Permanently removes the signed-in user's
// account and every row tied to it. Steps 2-6 are best-effort: a leftover row
// must never block the actual account removal, so each is wrapped on its own and
// failures are logged but tolerated. Step 7 (auth user deletion) is the one that
// has to succeed. The admin client uses the service role and bypasses RLS so it
// can reach soft-deleted quizzes and every related table.
export async function DELETE() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const userId = user.id;

  // Look up every quiz id owned by this user, including soft-deleted ones — we
  // are erasing everything, so deleted_at is deliberately not filtered.
  let quizIds: string[] = [];
  try {
    const { data, error } = await admin
      .from("quizzes")
      .select("id")
      .eq("owner_id", userId);
    if (error) throw error;
    quizIds = (data ?? []).map((row) => (row as { id: string }).id);
  } catch (err) {
    console.error("[account] quiz lookup failed:", err);
  }

  // Leads.
  try {
    const { error } = await admin.from("leads").delete().eq("owner_id", userId);
    if (error) throw error;
  } catch (err) {
    console.error("[account] lead deletion failed:", err);
  }

  // Quiz events (only if we found quizzes to scope by).
  if (quizIds.length > 0) {
    try {
      const { error } = await admin
        .from("quiz_events")
        .delete()
        .in("quiz_id", quizIds);
      if (error) throw error;
    } catch (err) {
      console.error("[account] quiz_events deletion failed:", err);
    }
  }

  // Builder events.
  try {
    const { error } = await admin
      .from("builder_events")
      .delete()
      .eq("owner_id", userId);
    if (error) throw error;
  } catch (err) {
    console.error("[account] builder_events deletion failed:", err);
  }

  // Quizzes.
  try {
    const { error } = await admin
      .from("quizzes")
      .delete()
      .eq("owner_id", userId);
    if (error) throw error;
  } catch (err) {
    console.error("[account] quiz deletion failed:", err);
  }

  // Profile.
  try {
    const { error } = await admin.from("profiles").delete().eq("id", userId);
    if (error) throw error;
  } catch (err) {
    console.error("[account] profile deletion failed:", err);
  }

  // The account itself. This is the step that must succeed.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[account] auth user deletion failed:", deleteError.message);
    return NextResponse.json(
      { error: "Could not delete account" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
