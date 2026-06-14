import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { TRASH_GRACE_DAYS } from "@/lib/trash";

export const runtime = "nodejs";

// GET /api/cron/purge-deleted — invoked daily by the Vercel cron (vercel.json).
// Permanently removes quizzes that have sat in the trash longer than the 30-day
// grace period. The hard delete cascades to their leads + quiz_events (FKs are
// `on delete cascade`), so this is the ONE place captured lead data is actually
// destroyed. Same Bearer-secret auth as the trial-reminders cron.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - TRASH_GRACE_DAYS * 24 * 3600 * 1000).toISOString();
  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("quizzes")
    .delete()
    .lt("deleted_at", cutoff)
    .select("id");

  if (error) {
    console.error("[purge-deleted] failed:", error.message);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
  return NextResponse.json({ purged: data?.length ?? 0 });
}
