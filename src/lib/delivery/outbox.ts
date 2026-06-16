import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { DeliveryJob, DeliveryJobKind } from "@/lib/types";
import { nextRetryDelayMs } from "./backoff";
import { renderTemplate } from "./templates";
import { sendFollowUpEmail, sendOwnerLeadNotification } from "@/lib/email";
import type { OwnerNotification } from "@/lib/email";
import { isSafeWebhookTarget } from "@/lib/ssrf";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface NewJob {
  lead_id: string;
  owner_id: string;
  kind: DeliveryJobKind;
  target?: string | null;
  payload: Record<string, unknown>;
}

// Insert a batch of jobs. Called from the lead route after the lead is written.
export async function enqueue(admin: AdminClient, jobs: NewJob[]): Promise<string[]> {
  if (jobs.length === 0) return [];
  const { data, error } = await admin
    .from("delivery_jobs")
    .insert(jobs.map((j) => ({ ...j, target: j.target ?? null })))
    .select("id");
  if (error) {
    console.error("[outbox] enqueue failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => (r as { id: string }).id);
}

// Atomically claim due jobs so after() and the cron sweeper never double-send.
// Reads due pending/failed rows, then reserves them by pushing send_after forward
// so a concurrent sweep skips them; the row is freed again by markDone/markFailed.
export async function claimDueJobs(admin: AdminClient, limit: number): Promise<DeliveryJob[]> {
  const { data, error } = await admin
    .from("delivery_jobs")
    .select("*")
    .in("status", ["pending", "failed"])
    .lte("send_after", new Date().toISOString())
    .order("send_after", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[outbox] claim query failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as DeliveryJob[];
  if (rows.length === 0) return [];
  const reserved = new Date(Date.now() + 5 * 60_000).toISOString();
  const ids = rows.map((r) => r.id);
  await admin.from("delivery_jobs").update({ send_after: reserved }).in("id", ids);
  return rows;
}

async function markDone(admin: AdminClient, id: string): Promise<void> {
  await admin
    .from("delivery_jobs")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", id);
}

async function markFailed(admin: AdminClient, job: DeliveryJob, error: string): Promise<void> {
  const attempts = job.attempts + 1;
  const dead = attempts >= job.max_attempts;
  await admin
    .from("delivery_jobs")
    .update({
      status: dead ? "dead" : "failed",
      attempts,
      last_error: error.slice(0, 500),
      send_after: new Date(Date.now() + nextRetryDelayMs(attempts)).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}

// Dispatch one job by kind. Throws on failure so processJob records the retry.
async function dispatch(job: DeliveryJob): Promise<void> {
  const p = job.payload as Record<string, unknown>;
  if (job.kind === "follow_up_email") {
    const ok = await sendFollowUpEmail({
      to: String(p.to),
      from: String(p.from),
      replyTo: String(p.replyTo),
      subject: renderTemplate(String(p.subject), p.vars as Record<string, string>),
      html: renderTemplate(String(p.html), p.vars as Record<string, string>),
    });
    if (!ok) throw new Error("follow-up send returned false");
    return;
  }
  if (job.kind === "owner_notify") {
    const ok = await sendOwnerLeadNotification(p as unknown as OwnerNotification);
    if (!ok) throw new Error("owner notify returned false");
    return;
  }
  if (job.kind === "webhook") {
    const url = String(p.url);
    if (!(await isSafeWebhookTarget(url))) throw new Error("webhook target unsafe");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "manual",
      body: JSON.stringify(p.body),
    });
    if (!res.ok) throw new Error(`webhook responded ${res.status}`);
    return;
  }
  // esp_push is added in Phase 2.
  throw new Error(`unknown job kind: ${job.kind}`);
}

export async function processJob(admin: AdminClient, job: DeliveryJob): Promise<void> {
  try {
    await dispatch(job);
    await markDone(admin, job.id);
  } catch (err) {
    await markFailed(admin, job, err instanceof Error ? err.message : String(err));
  }
}

// Process a specific set of just-enqueued jobs (the after() immediate path).
export async function processJobsByIds(admin: AdminClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { data } = await admin.from("delivery_jobs").select("*").in("id", ids).eq("status", "pending");
  for (const job of (data ?? []) as DeliveryJob[]) {
    await processJob(admin, job);
  }
}
