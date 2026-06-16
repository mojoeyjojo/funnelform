import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { DeliveryJob, DeliveryJobKind } from "@/lib/types";
import { nextRetryDelayMs } from "./backoff";
import { renderTemplate } from "./templates";
import { sendFollowUpEmail, sendOwnerLeadNotification } from "@/lib/email";
import type { OwnerNotification } from "@/lib/email";
import { isSafeWebhookTarget } from "@/lib/ssrf";
import { pushToIntegration } from "@/lib/integrations/store";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Reservation window when claiming jobs. Must exceed the cron sweep interval so a
// concurrent sweep skips reserved rows. Currently the sweeper runs every minute.
const CLAIM_WINDOW_MS = 5 * 60_000;

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

// Best-effort claim (SELECT then UPDATE, not atomic): reads due pending/failed
// rows, then reserves them by pushing send_after forward so a concurrent sweep
// skips them. A rare overlap between the immediate after() path and a cron tick
// could double-send a job; email/webhook delivery tolerates an occasional
// duplicate, so this is acceptable for this low-volume workload.
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
  const reserved = new Date(Date.now() + CLAIM_WINDOW_MS).toISOString();
  const ids = rows.map((r) => r.id);
  const { error: reserveError } = await admin
    .from("delivery_jobs")
    .update({ send_after: reserved })
    .in("id", ids);
  if (reserveError) {
    // Could not reserve the batch; drop it so the next sweep retries cleanly
    // rather than processing un-reserved rows.
    console.error("[outbox] reserve failed:", reserveError.message);
    return [];
  }
  return rows;
}

async function markDone(admin: AdminClient, id: string): Promise<void> {
  const { error } = await admin
    .from("delivery_jobs")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) console.error("[outbox] markDone failed:", error.message);
}

async function markFailed(admin: AdminClient, job: DeliveryJob, error: string): Promise<void> {
  const attempts = job.attempts + 1;
  const dead = attempts >= job.max_attempts;
  const { error: updateError } = await admin
    .from("delivery_jobs")
    .update({
      status: dead ? "dead" : "failed",
      attempts,
      last_error: error.slice(0, 500),
      send_after: new Date(Date.now() + nextRetryDelayMs(attempts)).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (updateError) console.error("[outbox] markFailed failed:", updateError.message);
}

// Dispatch one job by kind. Throws on failure so processJob records the retry.
async function dispatch(admin: AdminClient, job: DeliveryJob): Promise<void> {
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
    // enqueue() (in the lead route) controls this payload shape; the cast is intentional.
    const ok = await sendOwnerLeadNotification(p as unknown as OwnerNotification);
    if (!ok) throw new Error("owner notify returned false");
    return;
  }
  if (job.kind === "webhook") {
    const url = String(p.url);
    if (!(await isSafeWebhookTarget(url))) throw new Error("webhook target unsafe");
    // 5s timeout so a stalled endpoint cannot hold the after()/sweeper open.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "manual",
        body: JSON.stringify(p.body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`webhook responded ${res.status}`);
    } finally {
      clearTimeout(timeout);
    }
    return;
  }
  if (job.kind === "esp_push") {
    await pushToIntegration(
      admin,
      String(p.integrationId),
      String(p.targetId),
      p.contact as { email: string; name: string | null; tags: string[] },
    );
    return;
  }
  throw new Error(`unknown job kind: ${job.kind}`);
}

export async function processJob(admin: AdminClient, job: DeliveryJob): Promise<void> {
  try {
    await dispatch(admin, job);
    // Phase 1 does not record an owner_notified builder_event here; the generic
    // dispatcher stays channel-agnostic. Re-add per-channel instrumentation later.
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
