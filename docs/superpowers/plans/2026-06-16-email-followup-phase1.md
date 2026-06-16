# Email Follow-up Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reliable, per-outcome personalized follow-up email to every quiz lead, delivered through a transactional outbox so it (and the existing owner-notify + webhook channels) get retries and observability.

**Architecture:** Lead capture stays synchronous and authoritative. After the lead row is written, the route enqueues `delivery_jobs` rows (follow-up email, owner-notify, webhook), responds to the visitor immediately, and processes that lead's jobs via Next's `after()` for near-instant delivery. A Supabase `pg_cron` job (every minute, free) calls a sweeper endpoint that retries pending/failed jobs with exponential backoff and dead-letters after max attempts.

**Tech Stack:** Next 16 route handlers + `after()` from `next/server`; Supabase Postgres (`delivery_jobs` table, `pg_cron` + `pg_net`); Resend (existing `src/lib/email.ts`); Anthropic Haiku (existing `src/lib/anthropic.ts`) for AI draft; vitest (new) for unit tests. No new paid services.

**Scope note:** This is Phase 1 of the 3-phase spec at `docs/superpowers/specs/2026-06-16-email-integration-design.md`. ESP adapters (Kit/Mailchimp/MailerLite/Brevo) are Phase 2; custom sending domain is Phase 3. This phase delivers the personalized follow-up with zero ESP work and builds the outbox the later phases reuse.

**Project conventions the engineer must follow:**
- NO em dashes anywhere (chat, code comments, copy, docs). Restructure the sentence instead. This is a hard project rule.
- Server-only secrets use `createSupabaseAdminClient()` (service role, sync) from `src/lib/supabase/server.ts`. Auth'd user reads use `createSupabaseServerClient()` (async).
- This is a modified Next.js 16.2.7. Before writing code that touches a Next API, read the matching doc under `node_modules/next/dist/docs/`. The `after` doc is at `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`.
- Verify every task with `npx tsc --noEmit` and `npx eslint <files>` (zero new errors) and, where noted, `npm test` and `npm run build`.

---

## File Structure

**Create:**
- `vitest.config.ts` - vitest configuration
- `src/lib/delivery/templates.ts` - pure token renderer + follow-up config types
- `src/lib/delivery/templates.test.ts` - unit tests for the renderer
- `src/lib/delivery/backoff.ts` - pure exponential-backoff calculator
- `src/lib/delivery/backoff.test.ts` - unit tests for backoff
- `src/lib/delivery/outbox.ts` - enqueue / claimDueJobs / processJob (DB-touching)
- `src/app/api/cron/deliver-outbox/route.ts` - the retry sweeper endpoint
- `src/app/api/follow-up/draft/route.ts` - AI-draft endpoint for per-outcome copy
- `supabase/migrations/0008_delivery_jobs.sql` - the outbox table
- `supabase/migrations/0009_pg_cron_outbox.sql` - per-minute pg_cron schedule

**Modify:**
- `package.json` - add vitest + test script
- `src/lib/types.ts` - add `DeliveryJob`, `DeliveryJobKind`, follow-up config types
- `src/lib/email.ts` - add `sendFollowUpEmail` + `resolveFollowUpSender`
- `src/lib/anthropic.ts` - add `draftFollowUpEmail`
- `src/app/api/leads/route.ts` - enqueue jobs + `after()` instead of inline delivery
- `src/app/api/quizzes/[id]/route.ts` - accept `followUp` in the PATCH delivery schema
- `src/components/QuizSettings.tsx` - follow-up email editor block
- `src/components/EditQuizClient.tsx` - wire follow-up state + save
- `src/app/edit/[id]/page.tsx` - pass initial follow-up config

---

## Task 1: Set up vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/delivery/backoff.ts`, `src/lib/delivery/backoff.test.ts`

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest@^2`
Expected: vitest added to devDependencies.

- [ ] **Step 2: Add the test script to package.json**

In `package.json` `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write a failing backoff test**

Create `src/lib/delivery/backoff.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nextRetryDelayMs } from "./backoff";

describe("nextRetryDelayMs", () => {
  it("grows exponentially from a 30s base", () => {
    expect(nextRetryDelayMs(0)).toBe(30_000);
    expect(nextRetryDelayMs(1)).toBe(60_000);
    expect(nextRetryDelayMs(2)).toBe(120_000);
  });

  it("caps at 1 hour", () => {
    expect(nextRetryDelayMs(20)).toBe(3_600_000);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test`
Expected: FAIL, cannot import `nextRetryDelayMs` from `./backoff`.

- [ ] **Step 6: Implement `src/lib/delivery/backoff.ts`**

```ts
// Exponential backoff for outbox retries: 30s base, doubling per attempt,
// capped at 1 hour so a permanently failing endpoint still gets swept slowly.
const BASE_MS = 30_000;
const CAP_MS = 3_600_000;

export function nextRetryDelayMs(attempts: number): number {
  const delay = BASE_MS * 2 ** attempts;
  return Math.min(delay, CAP_MS);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/delivery/backoff.ts src/lib/delivery/backoff.test.ts
git commit -m "test: add vitest + outbox backoff calculator"
```

---

## Task 2: delivery_jobs table + types

**Files:**
- Create: `supabase/migrations/0008_delivery_jobs.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write the migration `supabase/migrations/0008_delivery_jobs.sql`**

```sql
-- Transactional outbox for lead delivery. Every channel (follow-up email,
-- owner notification, webhook, and later ESP pushes) becomes a job row so each
-- gets retries and observability. The lead row itself is written separately and
-- is authoritative; this table only governs delivery.
create table if not exists public.delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('follow_up_email', 'owner_notify', 'webhook', 'esp_push')),
  target text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'done', 'failed', 'dead')),
  attempts int not null default 0,
  max_attempts int not null default 6,
  send_after timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_jobs_due_idx
  on public.delivery_jobs (status, send_after)
  where status in ('pending', 'failed');

-- Service-role only: the outbox is written and processed exclusively by the
-- admin client. No user-facing policies; RLS on with no policy denies all
-- access to anon/authenticated roles.
alter table public.delivery_jobs enable row level security;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name `0008_delivery_jobs`, the SQL above) against project `ythoceabwoarvhufjuti`, or paste it into the Supabase SQL editor. Confirm with the Supabase MCP `list_tables` that `delivery_jobs` exists.

- [ ] **Step 3: Add types to `src/lib/types.ts`**

Append:

```ts
// Outbox delivery (see supabase/migrations/0008_delivery_jobs.sql).
export type DeliveryJobKind = "follow_up_email" | "owner_notify" | "webhook" | "esp_push";
export type DeliveryJobStatus = "pending" | "done" | "failed" | "dead";

export interface DeliveryJob {
  id: string;
  lead_id: string;
  owner_id: string;
  kind: DeliveryJobKind;
  target: string | null;
  payload: Record<string, unknown>;
  status: DeliveryJobStatus;
  attempts: number;
  max_attempts: number;
  send_after: string;
  last_error: string | null;
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_delivery_jobs.sql src/lib/types.ts
git commit -m "feat: delivery_jobs outbox table + types"
```

---

## Task 3: Follow-up config types + token renderer

**Files:**
- Create: `src/lib/delivery/templates.ts`, `src/lib/delivery/templates.test.ts`

- [ ] **Step 1: Write failing tests `src/lib/delivery/templates.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { renderTemplate } from "./templates";

describe("renderTemplate", () => {
  it("replaces known tokens", () => {
    const out = renderTemplate("Hi {{name}}, you are {{outcome}}", {
      name: "Sam",
      outcome: "Beginner",
    });
    expect(out).toBe("Hi Sam, you are Beginner");
  });

  it("replaces an unknown token with an empty string", () => {
    expect(renderTemplate("Hi {{name}}{{missing}}", { name: "Sam" })).toBe("Hi Sam");
  });

  it("is tolerant of surrounding whitespace in the token", () => {
    expect(renderTemplate("{{ name }}", { name: "Sam" })).toBe("Sam");
  });

  it("does not recurse into substituted values", () => {
    expect(renderTemplate("{{a}}", { a: "{{b}}", b: "x" })).toBe("{{b}}");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test src/lib/delivery/templates.test.ts`
Expected: FAIL, cannot import `renderTemplate`.

- [ ] **Step 3: Implement `src/lib/delivery/templates.ts`**

```ts
// Follow-up email config stored per quiz in the delivery jsonb. One subject and
// body per outcome id so each result gets genuinely different copy.
export interface FollowUpOutcomeTemplate {
  subject: string;
  body: string;
}

export interface FollowUpConfig {
  enabled: boolean;
  // mode "subdomain" sends from the branded Treeflow subdomain. "custom_domain"
  // is added in Phase 3; treat anything other than "custom_domain" as subdomain.
  sender: { mode: "subdomain" | "custom_domain" };
  outcomes: Record<string, FollowUpOutcomeTemplate>;
}

export type TemplateVars = Record<string, string | number | null | undefined>;

// Single-pass token replacement. Unknown tokens render empty; substituted values
// are NOT re-scanned, so a value containing {{...}} is left literal (no template
// injection). Tokens are {{name}} with optional inner whitespace.
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test src/lib/delivery/templates.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/delivery/templates.ts src/lib/delivery/templates.test.ts
git commit -m "feat: follow-up config types + token renderer"
```

---

## Task 4: Follow-up email sender + send function

**Files:**
- Modify: `src/lib/email.ts`
- Create: `src/lib/email.test.ts` (sender resolution only; sending is not unit-tested)

First read the top of `src/lib/email.ts` to match the existing Resend call style (it already has `sendOwnerLeadNotification` and `sendTrialEndingReminder` using the Resend REST API with `RESEND_API_KEY` / `RESEND_FROM`).

- [ ] **Step 1: Write failing test `src/lib/email.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolveFollowUpSender } from "./email";

describe("resolveFollowUpSender", () => {
  it("uses the branded subdomain by default with owner reply-to", () => {
    const s = resolveFollowUpSender({
      mode: "subdomain",
      brandName: "Coach Jane",
      ownerEmail: "jane@example.com",
      customFrom: null,
    });
    expect(s.from).toBe("Coach Jane <leads@contact.treeflow.tech>");
    expect(s.replyTo).toBe("jane@example.com");
  });

  it("falls back to the subdomain when custom domain is requested but not yet provisioned", () => {
    const s = resolveFollowUpSender({
      mode: "custom_domain",
      brandName: "Coach Jane",
      ownerEmail: "jane@example.com",
      customFrom: null,
    });
    expect(s.from).toBe("Coach Jane <leads@contact.treeflow.tech>");
  });

  it("sanitizes a brand name that contains angle brackets", () => {
    const s = resolveFollowUpSender({
      mode: "subdomain",
      brandName: "Jane <x>",
      ownerEmail: "jane@example.com",
      customFrom: null,
    });
    expect(s.from).toBe("Jane x <leads@contact.treeflow.tech>");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test src/lib/email.test.ts`
Expected: FAIL, no `resolveFollowUpSender` export.

- [ ] **Step 3: Add to `src/lib/email.ts`**

```ts
// Resolve the From/Reply-To for a lead follow-up. Default sends from the verified
// Treeflow subdomain with the owner's brand as the display name and replies routed
// to the owner inbox (beats a no-reply sender). customFrom is the verified custom
// domain address (Phase 3); until provisioned, customFrom is null and we fall back
// to the subdomain even when mode is custom_domain.
const FOLLOWUP_SUBDOMAIN_ADDRESS = "leads@contact.treeflow.tech";

export interface FollowUpSenderInput {
  mode: "subdomain" | "custom_domain";
  brandName: string;
  ownerEmail: string;
  customFrom: string | null;
}

export function resolveFollowUpSender(input: FollowUpSenderInput): {
  from: string;
  replyTo: string;
} {
  if (input.mode === "custom_domain" && input.customFrom) {
    return { from: input.customFrom, replyTo: input.ownerEmail };
  }
  // Strip characters that would break the "Name <addr>" header.
  const safeName = input.brandName.replace(/[<>"]/g, "").trim() || "Treeflow";
  return {
    from: `${safeName} <${FOLLOWUP_SUBDOMAIN_ADDRESS}>`,
    replyTo: input.ownerEmail,
  };
}

export interface FollowUpEmail {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
}

// Send one follow-up email via Resend. Returns true on a 2xx. Never throws (the
// outbox decides retry from the boolean), mirroring sendOwnerLeadNotification.
export async function sendFollowUpEmail(email: FollowUpEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY not set; cannot send follow-up");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: email.from,
        to: email.to,
        reply_to: email.replyTo,
        subject: email.subject,
        html: email.html,
      }),
    });
    if (!res.ok) {
      console.error("[email] follow-up send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] follow-up send error:", err instanceof Error ? err.message : err);
    return false;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test src/lib/email.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify the whole suite + types**

Run: `npm test && npx tsc --noEmit`
Expected: all pass, tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email.ts src/lib/email.test.ts
git commit -m "feat: follow-up email sender resolution + Resend send"
```

---

## Task 5: Outbox enqueue + processJob + claim

**Files:**
- Create: `src/lib/delivery/outbox.ts`

This is the DB-touching core. It is verified by `tsc` + the cron/lead integration in later tasks (not unit-tested, since it requires the live admin client). Read `src/app/api/leads/route.ts` first to reuse its webhook send logic and `src/lib/ssrf.ts` `isSafeWebhookTarget`.

- [ ] **Step 1: Implement `src/lib/delivery/outbox.ts`**

```ts
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { DeliveryJob, DeliveryJobKind } from "@/lib/types";
import { nextRetryDelayMs } from "./backoff";
import { renderTemplate } from "./templates";
import { sendFollowUpEmail, sendOwnerLeadNotification } from "@/lib/email";
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
// Flips pending/failed rows whose send_after has passed to a transient
// status by bumping send_after far forward; the row is freed again only by
// markDone/markFailed. Uses a single UPDATE ... RETURNING via an RPC-free pattern.
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
  // Reserve them: push send_after 5 minutes out so a concurrent sweep skips them.
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
    const ok = await sendOwnerLeadNotification(p as never);
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit && npx eslint src/lib/delivery/outbox.ts`
Expected: tsc exit 0, no eslint errors. (If `sendOwnerLeadNotification`'s argument type rejects `as never`, import its `OwnerNotification` type and cast to that instead.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/delivery/outbox.ts
git commit -m "feat: outbox enqueue, claim, and job dispatch"
```

---

## Task 6: Accept follow-up config in the quiz PATCH

**Files:**
- Modify: `src/app/api/quizzes/[id]/route.ts`

Read the current `UpdateQuizSchema` and the delivery-building block (around lines 16-39 and 89-115) first.

- [ ] **Step 1: Add the follow-up schema and field**

In `src/app/api/quizzes/[id]/route.ts`, add a Zod object for the follow-up config and include it in `UpdateQuizSchema` and the refine:

```ts
const FollowUpSchema = z.object({
  enabled: z.boolean(),
  sender: z.object({ mode: z.enum(["subdomain", "custom_domain"]) }),
  outcomes: z.record(
    z.string(),
    z.object({ subject: z.string().max(200), body: z.string().max(20000) }),
  ),
});
```

Add `followUp: FollowUpSchema.optional(),` to `UpdateQuizSchema`, and add `v.followUp !== undefined ||` to the refine's condition.

- [ ] **Step 2: Persist it into the delivery jsonb**

In the delivery-building block, follow-up config lives in the same `delivery` jsonb as `whatsapp`/`webhook`. Change the block so it merges rather than only handling whatsapp/webhook:

```ts
if (
  parsed.data.whatsapp !== undefined ||
  parsed.data.webhook !== undefined ||
  parsed.data.followUp !== undefined
) {
  const delivery: Record<string, unknown> = {};
  const w = (parsed.data.whatsapp ?? "").trim();
  const hook = (parsed.data.webhook ?? "").trim();
  if (w) delivery.whatsapp = w;
  if (hook) {
    if (!isWellFormedWebhookUrl(hook)) {
      return NextResponse.json(
        { error: "Webhook must be a valid https URL (not a local or private address)." },
        { status: 422 },
      );
    }
    delivery.webhook = hook;
  }
  if (parsed.data.followUp !== undefined) delivery.followUp = parsed.data.followUp;
  update.delivery = delivery;
}
```

Note: the editor sends whatsapp + webhook + followUp together on save (Task 9 ensures this), so the full rebuild does not drop a field.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/api/quizzes/[id]/route.ts && npm run build`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/quizzes/[id]/route.ts
git commit -m "feat: accept per-outcome follow-up config in quiz PATCH"
```

---

## Task 7: Enqueue delivery + after() in the leads route

**Files:**
- Modify: `src/app/api/leads/route.ts`

Read the full current route first. It currently: inserts the lead, inserts a `lead_captured` quiz_event, sends the owner-notify email inline, and POSTs the webhook inline. This task moves the owner-notify, webhook, and the new follow-up email into the outbox, processed via `after()`.

- [ ] **Step 1: Import the outbox and `after`**

At the top of the file add:

```ts
import { after } from "next/server";
import { enqueue, processJobsByIds } from "@/lib/delivery/outbox";
import { resolveFollowUpSender } from "@/lib/email";
import type { FollowUpConfig } from "@/lib/delivery/templates";
import type { NewJob } from "@/lib/delivery/outbox";
```

- [ ] **Step 2: Replace the inline owner-notify + webhook blocks with enqueue**

After the lead row is inserted and `outcomeName` is resolved, build the job list. Read the quiz `delivery` jsonb (already selected as `delivery`) for whatsapp/webhook/followUp, plus the owner profile email (already looked up for owner-notify):

```ts
const delivery = (quiz.delivery ?? {}) as {
  webhook?: string;
  followUp?: FollowUpConfig;
};
const jobs: NewJob[] = [];

// Owner notification (was inline). leadsUrl + ownerEmail resolved as before.
if (ownerEmail) {
  jobs.push({
    lead_id: leadId,
    owner_id: quiz.owner_id,
    kind: "owner_notify",
    payload: {
      ownerEmail,
      quizTitle: quiz.title ?? "your quiz",
      leadName: cleanName,
      leadEmail: email,
      leadPhone: phone ?? null,
      outcomeName,
      leadsUrl: `${new URL(request.url).origin}/leads/${quiz_id}`,
    },
  });
}

// Webhook (was inline).
if (typeof delivery.webhook === "string" && delivery.webhook) {
  jobs.push({
    lead_id: leadId,
    owner_id: quiz.owner_id,
    kind: "webhook",
    target: delivery.webhook,
    payload: {
      url: delivery.webhook,
      body: {
        quiz_id,
        name: cleanName,
        email,
        phone: phone ?? null,
        answers,
        outcome_id: outcome_id ?? null,
        outcome_name: outcomeName,
        created_at: new Date().toISOString(),
      },
    },
  });
}

// Personalized follow-up email to the lead.
const followUp = delivery.followUp;
const outcomeTemplate = followUp?.enabled && outcome_id ? followUp.outcomes?.[outcome_id] : undefined;
if (followUp?.enabled && outcomeTemplate && cleanName !== undefined) {
  const sender = resolveFollowUpSender({
    mode: followUp.sender?.mode ?? "subdomain",
    brandName: quiz.title ?? "Treeflow",
    ownerEmail: ownerEmail ?? "",
    customFrom: null, // Phase 3 provides the verified custom domain address
  });
  jobs.push({
    lead_id: leadId,
    owner_id: quiz.owner_id,
    kind: "follow_up_email",
    payload: {
      to: email,
      from: sender.from,
      replyTo: sender.replyTo,
      subject: outcomeTemplate.subject,
      html: outcomeTemplate.body,
      vars: {
        name: cleanName ?? "there",
        outcome: outcomeName ?? "",
        result_link: `${new URL(request.url).origin}/q/${quiz.slug ?? ""}`,
        quiz_title: quiz.title ?? "",
        owner_name: quiz.title ?? "",
      },
    },
  });
}

const admin2 = createSupabaseAdminClient();
const jobIds = await enqueue(admin2, jobs);
after(async () => {
  await processJobsByIds(admin2, jobIds);
});
```

Requirements for this step:
- Capture the inserted lead id: change the lead insert to `.select("id").single()` and read `leadId`.
- Add `slug` to the quiz select (it currently selects `owner_id, status, title, config, delivery`; add `slug`).
- Resolve `ownerEmail` once (the route already looks it up for the owner-notify email); reuse that value here instead of the inline send.
- Delete the old inline `sendOwnerLeadNotification` block and the old inline webhook `fetch` block (their logic now lives in the outbox).
- Keep the `owner_notified` builder_event behavior out of the synchronous path; record it inside the job dispatch later if needed (acceptable to drop the synchronous builder_event for now; note this in the commit).

- [ ] **Step 3: Verify build + lint + types + em dashes**

Run: `npx tsc --noEmit && npx eslint src/app/api/leads/route.ts && npm run build && grep -n "—" src/app/api/leads/route.ts || echo "no em dash"`
Expected: tsc 0, eslint clean, build compiles, no em dash.

- [ ] **Step 4: Runtime smoke (local)**

Run `npm run dev`, publish a test quiz with a follow-up template on one outcome, complete it as a visitor with a real email you control, and confirm: the lead row appears, three `delivery_jobs` rows are created (owner_notify, follow_up_email; webhook only if set), and they flip to `done`. Query: in Supabase SQL editor `select kind, status, attempts, last_error from delivery_jobs order by created_at desc limit 10;`.
Expected: jobs reach `done`; the follow-up email arrives at the lead address.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/leads/route.ts
git commit -m "feat: route lead delivery through the outbox + after()"
```

---

## Task 8: Cron sweeper endpoint

**Files:**
- Create: `src/app/api/cron/deliver-outbox/route.ts`

- [ ] **Step 1: Implement the endpoint**

```ts
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { claimDueJobs, processJob } from "@/lib/delivery/outbox";

export const runtime = "nodejs";

// GET /api/cron/deliver-outbox: the retry sweeper. Invoked every minute by
// Supabase pg_cron (see migration 0009) with the CRON_SECRET bearer. Claims due
// pending/failed jobs and processes them; backoff and dead-lettering live in the
// outbox. Bounded batch per run so a backlog drains over several minutes.
export async function GET(request: Request) {
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/api/cron/deliver-outbox/route.ts && npm run build`
Expected: clean.

- [ ] **Step 3: Local auth smoke**

With `npm run dev` running and `CRON_SECRET` set in `.env.local`:
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/deliver-outbox` (expect 401), then `curl -s -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/deliver-outbox` (expect `{"processed":...}`).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/deliver-outbox/route.ts
git commit -m "feat: outbox retry sweeper endpoint"
```

---

## Task 9: Supabase pg_cron schedule

**Files:**
- Create: `supabase/migrations/0009_pg_cron_outbox.sql`

Verify the exact `pg_net` function signature in the Supabase project before applying (use the Supabase MCP `search_docs` for "pg_cron pg_net http_post"). The vault-based secret read below is the documented Supabase pattern; if Vault is not set up, inline the production URL and store the bearer in `vault` first.

- [ ] **Step 1: Write the migration**

```sql
-- Per-minute outbox sweeper. pg_cron triggers an HTTP POST (via pg_net) to the
-- deploy's cron endpoint, which retries due delivery jobs. Free on all Supabase
-- plans, so the sweeper does not depend on Vercel cron cadence.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the production base URL and cron secret in Vault first (one time, via the
-- dashboard or SQL):
--   select vault.create_secret('https://treeflow.tech', 'app_base_url');
--   select vault.create_secret('<CRON_SECRET value>', 'cron_secret');

select cron.schedule(
  'deliver-outbox',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/deliver-outbox',
    headers := jsonb_build_object(
      'authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    )
  );
  $$
);
```

- [ ] **Step 2: Apply and verify**

Apply via Supabase MCP `apply_migration` (name `0009_pg_cron_outbox`). Verify the job exists: in the SQL editor `select jobname, schedule from cron.job;` should list `deliver-outbox` at `* * * * *`. After a minute, `select status, count(*) from net._http_response group by status;` should show 200s (or check `delivery_jobs` draining).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0009_pg_cron_outbox.sql
git commit -m "feat: per-minute pg_cron outbox sweeper schedule"
```

---

## Task 10: AI-draft endpoint + editor follow-up UI

**Files:**
- Modify: `src/lib/anthropic.ts`, `src/components/QuizSettings.tsx`, `src/components/EditQuizClient.tsx`, `src/app/edit/[id]/page.tsx`
- Create: `src/app/api/follow-up/draft/route.ts`

Read `src/lib/anthropic.ts` (`extractSiteFacts` shows the Haiku structured-output call style) and `QuizSettings.tsx` / `EditQuizClient.tsx` (the existing webhook + whatsapp fields show the prop + state + save pattern) first.

- [ ] **Step 1: Add `draftFollowUpEmail` to `src/lib/anthropic.ts`**

```ts
// Draft a short, warm follow-up email for one quiz outcome. Returns subject + body
// (plain text/light HTML). Uses Haiku for speed and cost; the owner edits after.
export async function draftFollowUpEmail(input: {
  quizTitle: string;
  outcomeName: string;
  outcomeDescription: string;
  ownerName: string;
}): Promise<{ subject: string; body: string }> {
  const client = getAnthropic();
  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 700,
    system:
      "You write a single concise, friendly follow-up email a business sends to a quiz lead who got a specific result. Use the tokens {{name}} and {{result_link}} where natural. No em dashes. Keep it under 150 words. Return JSON only.",
    messages: [
      {
        role: "user",
        content: `Quiz: ${input.quizTitle}\nResult: ${input.outcomeName}\nResult description: ${input.outcomeDescription}\nFrom: ${input.ownerName}\n\nReturn JSON: {"subject": string, "body": string}`,
      },
    ],
  });
  const text = msg.content.find((c) => c.type === "text");
  const raw = text && "text" in text ? text.text : "{}";
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as {
    subject: string;
    body: string;
  };
  return { subject: parsed.subject, body: parsed.body };
}
```

Confirm the exact model id and client accessor against the existing `extractSiteFacts`; reuse the same `getAnthropic()` and parsing helper if one exists rather than duplicating.

- [ ] **Step 2: Create `src/app/api/follow-up/draft/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { draftFollowUpEmail } from "@/lib/anthropic";

export const runtime = "nodejs";

const DraftSchema = z.object({
  quizTitle: z.string().max(200),
  outcomeName: z.string().max(200),
  outcomeDescription: z.string().max(2000),
  ownerName: z.string().max(200),
});

// POST /api/follow-up/draft: authenticated owners only. Drafts per-outcome copy.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = DraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 422 });
  }
  try {
    const draft = await draftFollowUpEmail(parsed.data);
    return NextResponse.json(draft);
  } catch (err) {
    console.error("[follow-up/draft] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not draft" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add the follow-up block to `QuizSettings.tsx`**

Add props `followUp: FollowUpConfig` and `onFollowUp: (next: FollowUpConfig) => void`, plus the quiz outcomes (already available in the editor) so the block can render one subject/body editor per outcome. Render: an enable toggle, and for each outcome a subject input + body textarea + an "AI draft" button that POSTs to `/api/follow-up/draft` and fills that outcome's fields. Use the existing neutral `.editor-ui` styling already used by the webhook/whatsapp fields. Default config when none exists: `{ enabled: false, sender: { mode: "subdomain" }, outcomes: {} }`.

- [ ] **Step 4: Wire state + save in `EditQuizClient.tsx`**

Add `followUp` state initialized from a new `initialFollowUp` prop, an `editFollowUp` handler that sets dirty, include `followUp` in the PATCH save body (alongside the existing `whatsapp` and `webhook`), and pass `followUp`/`onFollowUp` to `QuizSettings`. Confirm the save sends whatsapp + webhook + followUp together (so the delivery-jsonb rebuild in Task 6 does not drop a field).

- [ ] **Step 5: Pass initial config in `src/app/edit/[id]/page.tsx`**

Read `delivery.followUp` from the loaded quiz and pass `initialFollowUp={(data.delivery as { followUp?: FollowUpConfig } | null)?.followUp ?? { enabled: false, sender: { mode: "subdomain" }, outcomes: {} }}`.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx eslint src/lib/anthropic.ts src/app/api/follow-up/draft/route.ts src/components/QuizSettings.tsx src/components/EditQuizClient.tsx src/app/edit/[id]/page.tsx && npm run build`
Expected: all clean. Then grep all five files for em dashes and remove any.

- [ ] **Step 7: Runtime smoke**

In the editor, enable follow-up, click AI draft on an outcome (expect populated subject/body), edit, Save, reload (expect persistence), then complete the quiz as a visitor and confirm the follow-up email arrives personalized.

- [ ] **Step 8: Commit**

```bash
git add src/lib/anthropic.ts src/app/api/follow-up/draft/route.ts src/components/QuizSettings.tsx src/components/EditQuizClient.tsx src/app/edit/[id]/page.tsx
git commit -m "feat: AI-drafted per-outcome follow-up editor"
```

---

## Final verification

- [ ] `npm test` (all unit tests pass)
- [ ] `npx tsc --noEmit` (exit 0)
- [ ] `npx eslint .` (no new errors)
- [ ] `npm run build` (compiles; `/api/cron/deliver-outbox` and `/api/follow-up/draft` present)
- [ ] `grep -rn "—" src/lib/delivery src/app/api/cron/deliver-outbox src/app/api/follow-up` returns nothing (project em-dash rule)
- [ ] End-to-end: publish a quiz with a follow-up template, complete it, confirm the lead row, the `delivery_jobs` reaching `done`, and the personalized email arriving.
- [ ] Do NOT deploy or merge automatically; leave on the branch for review unless the user asks to ship.

## Phase 2 / Phase 3 preview (not in this plan)

- **Phase 2:** `integrations` table + AES-256-GCM credential encryption, the `EmailDestination` adapter framework, Kit + Mailchimp adapters, the `esp_push` job kind (the outbox already supports it), and the editor connect UI.
- **Phase 3:** MailerLite + Brevo adapters; custom sending domain via Resend Domains API with DNS verification, gated to Pro via `effectivePlan()` / `hasProFeatures()`.
