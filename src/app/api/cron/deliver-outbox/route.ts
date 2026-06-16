import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { claimDueJobs, processJob } from "@/lib/delivery/outbox";

export const runtime = "nodejs";

// POST /api/cron/deliver-outbox: the retry sweeper. Invoked every minute by
// Supabase pg_cron via net.http_post (see migration 0009) with the CRON_SECRET
// bearer. Claims due pending/failed jobs and processes them; backoff and
// dead-lettering live in the outbox. Bounded batch per run so a backlog drains
// over several minutes. POST (not GET) to match the pg_net http_post call.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  const jobs = await claimDueJobs(admin, 50);
  for (const job of jobs) {
    await processJob(admin, job);
  }
  return NextResponse.json({ processed: jobs.length });
}
