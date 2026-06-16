# Email ESP Integrations Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a quiz owner connect their email tool (Kit or Mailchimp) with an API key and have every captured lead pushed to it as a subscriber, tagged by the quiz outcome, through the existing delivery outbox.

**Architecture:** A provider/adapter "dock": one `EmailDestination` interface, a registry, and a `fetch`-based adapter per provider (no SDKs). Account-level connections live in a new `integrations` table with the API key encrypted at rest (AES-256-GCM via `node:crypto`). A quiz references a connection + target list/form in its `delivery.destinations`. On lead capture the leads route enqueues an `esp_push` job per destination; the outbox `dispatch()` (which already stubs `esp_push`) loads + decrypts the connection and calls the adapter.

**Tech Stack:** Next 16 route handlers; Supabase Postgres (`integrations` table); `node:crypto` AES-256-GCM (new `INTEGRATIONS_ENC_KEY` env); `fetch` adapters for Kit v4 + Mailchimp Marketing API; vitest. Builds on Phase 1's outbox (`src/lib/delivery/`).

**Scope note:** Phase 2 of the spec at `docs/superpowers/specs/2026-06-16-email-integration-design.md`. Providers this phase: **Kit + Mailchimp**. MailerLite + Brevo and the custom sending domain are Phase 3. v1 contact mapping = subscribe to the chosen list/form + tag = outcome name (+ quiz title); richer custom-field mapping is deferred.

**Verified provider API facts (June 2026):**
- **Mailchimp Marketing API**: base `https://{dc}.api.mailchimp.com/3.0` where `{dc}` is the suffix after the final hyphen of the API key (e.g. `...-us21` -> `us21`). Auth: HTTP Basic, any username + the API key (`Authorization: Basic base64("any:"+key)`). Upsert member: `PUT /lists/{list_id}/members/{subscriber_hash}` where `subscriber_hash = md5(lowercase(email))`, body `{ email_address, status_if_new: "subscribed", status: "subscribed", merge_fields? }` (use `PUT` for upsert; include `status_if_new` so existing members are not downgraded). Tags: `POST /lists/{list_id}/members/{subscriber_hash}/tags` body `{ tags: [{ name, status: "active" }] }`. List audiences: `GET /lists?count=100` -> `{ lists: [{ id, name }] }`. Validate key + dc: `GET /ping`.
- **Kit (ConvertKit) v4 API**: base `https://api.kit.com/v4`. Auth header `X-Kit-Api-Key: {key}`. Upsert subscriber: `POST /subscribers` body `{ email_address, first_name? }` (upsert by email). Add to form: `POST /forms/{form_id}/subscribers` body `{ email_address }`. Tag by email: `POST /tags/{tag_id}/subscribers` body `{ email_address }`. List forms: `GET /forms`; list tags: `GET /tags`. Validate key: `GET /account`.
  NOTE: Kit tags are referenced by tag id, not name. v1 maps the outcome to a Kit tag by matching the outcome name against the owner's existing tags (case-insensitive) and skipping if no matching tag exists (logged, not an error). Creating tags on the fly is a Phase 3 nicety.

**Project conventions (carried from Phase 1):**
- NO em dashes anywhere (code, comments, copy, docs). Restructure instead. Hard rule.
- Secrets/decryption are server-only (`import "server-only"`). Admin client `createSupabaseAdminClient()` (service role, sync); authed user client `createSupabaseServerClient()` (async).
- Adapters use `fetch` only (no SDKs). All adapter network calls get a timeout via `AbortController` (5s), mirroring the outbox webhook path.
- Verify every task with `npx tsc --noEmit`, `npx eslint <files>`, and `npm test` / `npm run build` where noted.

---

## File Structure

**Create:**
- `supabase/migrations/0010_integrations.sql` - account-level ESP connections
- `src/lib/integrations/crypto.ts` + `.test.ts` - AES-256-GCM encrypt/decrypt for stored keys
- `src/lib/integrations/types.ts` - `EmailDestination`, `EspContact`, `EspTarget`, `EspCredentials`
- `src/lib/integrations/mailchimp.ts` + `.test.ts` - Mailchimp adapter
- `src/lib/integrations/kit.ts` + `.test.ts` - Kit adapter
- `src/lib/integrations/index.ts` - registry (`getAdapter`)
- `src/lib/integrations/store.ts` - load/decrypt a connection + push helper used by the outbox
- `src/app/api/integrations/route.ts` - GET (list connections) + POST (connect)
- `src/app/api/integrations/[id]/route.ts` - DELETE (disconnect) + GET (list targets)

**Modify:**
- `src/lib/types.ts` - `Integration`, `EspProvider`, `QuizDestination` types
- `src/lib/delivery/outbox.ts` - implement the `esp_push` branch in `dispatch()`
- `src/app/api/leads/route.ts` - enqueue an `esp_push` job per `delivery.destinations`
- `src/app/api/quizzes/[id]/route.ts` - accept `destinations` in the PATCH delivery schema
- `src/components/QuizSettings.tsx` + `EditQuizClient.tsx` + `src/app/edit/[id]/page.tsx` - connect + destination UI

---

## Task 1: integrations table + types

**Files:** Create `supabase/migrations/0010_integrations.sql`; modify `src/lib/types.ts`.

- [ ] **Step 1: Write `supabase/migrations/0010_integrations.sql`**

```sql
-- Account-level ESP/CRM connections. One row per (owner, provider). The API key
-- is stored encrypted (AES-256-GCM, app-side) in encrypted_credentials; it is
-- never returned to the client. Decryption happens server-side only.
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('kit', 'mailchimp')),
  encrypted_credentials text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'needs_reconnect')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

-- Owner-scoped RLS so a signed-in user can manage their own connections. The
-- encrypted blob is opaque without INTEGRATIONS_ENC_KEY (server-only), and the
-- API routes never select it into a client response.
alter table public.integrations enable row level security;

create policy "own integrations select" on public.integrations
  for select using (owner_id = auth.uid());
create policy "own integrations insert" on public.integrations
  for insert with check (owner_id = auth.uid());
create policy "own integrations update" on public.integrations
  for update using (owner_id = auth.uid());
create policy "own integrations delete" on public.integrations
  for delete using (owner_id = auth.uid());
```

- [ ] **Step 2: Apply the migration** via the Supabase MCP `apply_migration` (name `0010_integrations`) against project `ythoceabwoarvhufjuti`, or the SQL editor. (Coordinator applies; do not apply from an implementer subagent.) Confirm with `list_tables` that `integrations` exists.

- [ ] **Step 3: Add types to `src/lib/types.ts`** (append):

```ts
// ESP integrations (see supabase/migrations/0010_integrations.sql).
export type EspProvider = "kit" | "mailchimp";

export interface Integration {
  id: string;
  owner_id: string;
  provider: EspProvider;
  status: "active" | "needs_reconnect";
  last_error: string | null;
}

// Per-quiz: push captured leads to this connection's target list/form. Stored in
// the quiz delivery jsonb as `destinations: QuizDestination[]`.
export interface QuizDestination {
  integrationId: string;
  provider: EspProvider;
  targetId: string;
  targetName: string;
}
```

- [ ] **Step 4: Verify** `npx tsc --noEmit` (exit 0).
- [ ] **Step 5: Commit** `git add supabase/migrations/0010_integrations.sql src/lib/types.ts && git commit -m "feat: integrations table + ESP types"`

---

## Task 2: Credential encryption helper

**Files:** Create `src/lib/integrations/crypto.ts`, `src/lib/integrations/crypto.test.ts`.

- [ ] **Step 1: Write the failing test `src/lib/integrations/crypto.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto";

beforeAll(() => {
  // 32-byte key, base64. Deterministic for the test run only.
  process.env.INTEGRATIONS_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("crypto", () => {
  it("round-trips a secret", () => {
    const blob = encryptSecret("sk_live_abc123");
    expect(blob).not.toContain("sk_live_abc123");
    expect(decryptSecret(blob)).toBe("sk_live_abc123");
  });

  it("produces a different ciphertext each call (random iv)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects a tampered ciphertext", () => {
    const blob = encryptSecret("secret");
    const parts = blob.split(":");
    const tampered = `${parts[0]}:${parts[1]}:${Buffer.from("xxxx").toString("base64")}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify it fails** `npm test src/lib/integrations/crypto.test.ts` (cannot import).

- [ ] **Step 3: Implement `src/lib/integrations/crypto.ts`**

```ts
import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for ESP API keys at rest. Key is INTEGRATIONS_ENC_KEY: 32 raw bytes
// supplied base64 in the environment. Stored format is "ivB64:tagB64:ctB64".
function key(): Buffer {
  const raw = process.env.INTEGRATIONS_ENC_KEY;
  if (!raw) throw new Error("INTEGRATIONS_ENC_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("INTEGRATIONS_ENC_KEY must decode to 32 bytes");
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(blob: string): string {
  const [ivB64, tagB64, ctB64] = blob.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run, verify pass** `npm test src/lib/integrations/crypto.test.ts` (3 pass).
- [ ] **Step 5: Generate + set the env key.** Locally add to `.env.local`: `INTEGRATIONS_ENC_KEY=<openssl rand -base64 32>`. (Coordinator sets it in Vercel prod before the esp_push path is used; note it in the report.)
- [ ] **Step 6: Commit** `git add src/lib/integrations/crypto.ts src/lib/integrations/crypto.test.ts && git commit -m "feat: AES-256-GCM credential encryption for integrations"`

---

## Task 3: EmailDestination interface + registry

**Files:** Create `src/lib/integrations/types.ts`, `src/lib/integrations/index.ts`.

- [ ] **Step 1: Write `src/lib/integrations/types.ts`**

```ts
import type { EspProvider } from "@/lib/types";

// Credentials are a single API key for both v1 providers (Mailchimp derives its
// datacenter from the key suffix; Kit uses the key directly).
export interface EspCredentials {
  apiKey: string;
}

// A list / form / audience the owner can push subscribers into.
export interface EspTarget {
  id: string;
  name: string;
}

// The normalized lead handed to every adapter.
export interface EspContact {
  email: string;
  name: string | null;
  tags: string[]; // e.g. [outcome name, quiz title]
}

export interface EmailDestination {
  id: EspProvider;
  label: string;
  // Cheap authenticated call to confirm the key works. Returns ok:false (never
  // throws) so the connect route can surface a clean error.
  validateCredentials(creds: EspCredentials): Promise<{ ok: boolean; error?: string }>;
  // The owner's lists/forms to choose a target from.
  listTargets(creds: EspCredentials): Promise<EspTarget[]>;
  // Subscribe/upsert the contact into targetId and apply its tags. Throws on
  // failure so the outbox records a retry.
  upsertSubscriber(creds: EspCredentials, targetId: string, contact: EspContact): Promise<void>;
}
```

- [ ] **Step 2: Write `src/lib/integrations/index.ts`**

```ts
import "server-only";
import type { EspProvider } from "@/lib/types";
import type { EmailDestination } from "./types";
import { mailchimp } from "./mailchimp";
import { kit } from "./kit";

const ADAPTERS: Record<EspProvider, EmailDestination> = {
  mailchimp,
  kit,
};

export function getAdapter(provider: EspProvider): EmailDestination {
  return ADAPTERS[provider];
}

export const ALL_ADAPTERS: EmailDestination[] = [mailchimp, kit];
```

- [ ] **Step 3: Verify** `npx tsc --noEmit` will FAIL until Tasks 4 and 5 create `./mailchimp` and `./kit`. That is expected; this task's interface file is verified by Task 4/5 compiling against it. Do not add stubs. Commit the two files now; tsc is run green at the end of Task 5.
- [ ] **Step 4: Commit** `git add src/lib/integrations/types.ts src/lib/integrations/index.ts && git commit -m "feat: EmailDestination interface + adapter registry"`

---

## Task 4: Mailchimp adapter

**Files:** Create `src/lib/integrations/mailchimp.ts`, `src/lib/integrations/mailchimp.test.ts`.

- [ ] **Step 1: Write the failing test `src/lib/integrations/mailchimp.test.ts`** (mock `fetch`, assert request shape)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mailchimp } from "./mailchimp";

const KEY = "abc123def456-us21";

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init))));
}

beforeEach(() => vi.restoreAllMocks());

describe("mailchimp adapter", () => {
  it("derives the datacenter from the key suffix and pings to validate", async () => {
    let called = "";
    mockFetch((url) => {
      called = url;
      return new Response("{}", { status: 200 });
    });
    const res = await mailchimp.validateCredentials({ apiKey: KEY });
    expect(res.ok).toBe(true);
    expect(called).toBe("https://us21.api.mailchimp.com/3.0/ping");
  });

  it("upserts a member with PUT to the md5 hash and then applies tags", async () => {
    const calls: { url: string; method: string }[] = [];
    mockFetch((url, init) => {
      calls.push({ url, method: init.method as string });
      return new Response("{}", { status: 200 });
    });
    await mailchimp.upsertSubscriber({ apiKey: KEY }, "listABC", {
      email: "Sam@Example.com",
      name: "Sam",
      tags: ["Beginner"],
    });
    // md5("sam@example.com") = a2dd2e4e3a... (lowercased before hashing)
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toContain("/lists/listABC/members/");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].url).toContain("/tags");
  });

  it("returns ok:false on a 401 rather than throwing in validateCredentials", async () => {
    mockFetch(() => new Response("{}", { status: 401 }));
    const res = await mailchimp.validateCredentials({ apiKey: KEY });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail** `npm test src/lib/integrations/mailchimp.test.ts`.

- [ ] **Step 3: Implement `src/lib/integrations/mailchimp.ts`**

```ts
import "server-only";
import { createHash } from "node:crypto";
import type { EmailDestination, EspContact, EspCredentials, EspTarget } from "./types";

// Datacenter is the suffix after the final hyphen of the API key.
function dc(apiKey: string): string {
  const parts = apiKey.split("-");
  return parts[parts.length - 1] || "us1";
}

function base(apiKey: string): string {
  return `https://${dc(apiKey)}.api.mailchimp.com/3.0`;
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`any:${apiKey}`).toString("base64")}`;
}

function subscriberHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

async function call(apiKey: string, path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${base(apiKey)}${path}`, {
      ...init,
      headers: { Authorization: authHeader(apiKey), "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const mailchimp: EmailDestination = {
  id: "mailchimp",
  label: "Mailchimp",
  async validateCredentials(creds: EspCredentials) {
    try {
      const res = await call(creds.apiKey, "/ping");
      return res.ok ? { ok: true } : { ok: false, error: `Mailchimp returned ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "request failed" };
    }
  },
  async listTargets(creds: EspCredentials): Promise<EspTarget[]> {
    const res = await call(creds.apiKey, "/lists?count=100&fields=lists.id,lists.name");
    if (!res.ok) throw new Error(`Mailchimp lists ${res.status}`);
    const data = (await res.json()) as { lists?: { id: string; name: string }[] };
    return (data.lists ?? []).map((l) => ({ id: l.id, name: l.name }));
  },
  async upsertSubscriber(creds: EspCredentials, targetId: string, contact: EspContact) {
    const hash = subscriberHash(contact.email);
    const put = await call(creds.apiKey, `/lists/${targetId}/members/${hash}`, {
      method: "PUT",
      body: JSON.stringify({
        email_address: contact.email,
        status_if_new: "subscribed",
        merge_fields: contact.name ? { FNAME: contact.name } : undefined,
      }),
    });
    if (!put.ok) throw new Error(`Mailchimp upsert ${put.status}`);
    if (contact.tags.length > 0) {
      const tagRes = await call(creds.apiKey, `/lists/${targetId}/members/${hash}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: contact.tags.map((name) => ({ name, status: "active" })) }),
      });
      if (!tagRes.ok) throw new Error(`Mailchimp tag ${tagRes.status}`);
    }
  },
};
```

- [ ] **Step 4: Run, verify pass** `npm test src/lib/integrations/mailchimp.test.ts`.
- [ ] **Step 5: Commit** `git add src/lib/integrations/mailchimp.ts src/lib/integrations/mailchimp.test.ts && git commit -m "feat: Mailchimp ESP adapter"`

---

## Task 5: Kit adapter

**Files:** Create `src/lib/integrations/kit.ts`, `src/lib/integrations/kit.test.ts`.

- [ ] **Step 1: Write the failing test `src/lib/integrations/kit.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { kit } from "./kit";

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => Promise.resolve(handler(url, init))));
}
beforeEach(() => vi.restoreAllMocks());

describe("kit adapter", () => {
  it("validates via /account with the X-Kit-Api-Key header", async () => {
    let header = "";
    mockFetch((url, init) => {
      header = (init.headers as Record<string, string>)["X-Kit-Api-Key"];
      expect(url).toBe("https://api.kit.com/v4/account");
      return new Response("{}", { status: 200 });
    });
    const res = await kit.validateCredentials({ apiKey: "k123" });
    expect(res.ok).toBe(true);
    expect(header).toBe("k123");
  });

  it("upserts the subscriber, adds to the form, and tags by matching name", async () => {
    const calls: { url: string; method: string }[] = [];
    mockFetch((url, init) => {
      calls.push({ url, method: (init.method as string) ?? "GET" });
      if (url.endsWith("/tags")) return new Response(JSON.stringify({ tags: [{ id: 9, name: "Beginner" }] }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    await kit.upsertSubscriber({ apiKey: "k" }, "form55", { email: "a@b.com", name: "A", tags: ["Beginner"] });
    expect(calls.some((c) => c.url.endsWith("/v4/subscribers") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/v4/forms/form55/subscribers"))).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/v4/tags/9/subscribers"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `src/lib/integrations/kit.ts`**

```ts
import "server-only";
import type { EmailDestination, EspContact, EspCredentials, EspTarget } from "./types";

const BASE = "https://api.kit.com/v4";

async function call(apiKey: string, path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "X-Kit-Api-Key": apiKey, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const kit: EmailDestination = {
  id: "kit",
  label: "Kit (ConvertKit)",
  async validateCredentials(creds: EspCredentials) {
    try {
      const res = await call(creds.apiKey, "/account");
      return res.ok ? { ok: true } : { ok: false, error: `Kit returned ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "request failed" };
    }
  },
  async listTargets(creds: EspCredentials): Promise<EspTarget[]> {
    // Kit subscribes into a form. List the owner's forms as targets.
    const res = await call(creds.apiKey, "/forms");
    if (!res.ok) throw new Error(`Kit forms ${res.status}`);
    const data = (await res.json()) as { forms?: { id: number; name: string }[] };
    return (data.forms ?? []).map((f) => ({ id: String(f.id), name: f.name }));
  },
  async upsertSubscriber(creds: EspCredentials, targetId: string, contact: EspContact) {
    // 1. Upsert the subscriber (by email).
    const sub = await call(creds.apiKey, "/subscribers", {
      method: "POST",
      body: JSON.stringify({ email_address: contact.email, first_name: contact.name ?? undefined }),
    });
    if (!sub.ok) throw new Error(`Kit subscriber ${sub.status}`);
    // 2. Add to the chosen form.
    const form = await call(creds.apiKey, `/forms/${targetId}/subscribers`, {
      method: "POST",
      body: JSON.stringify({ email_address: contact.email }),
    });
    if (!form.ok) throw new Error(`Kit form add ${form.status}`);
    // 3. Tag by matching the outcome name to an existing tag (Kit tags are by id).
    if (contact.tags.length > 0) {
      const tagsRes = await call(creds.apiKey, "/tags");
      if (tagsRes.ok) {
        const data = (await tagsRes.json()) as { tags?: { id: number; name: string }[] };
        const existing = data.tags ?? [];
        for (const tagName of contact.tags) {
          const match = existing.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
          if (!match) {
            console.warn(`[kit] no tag named "${tagName}"; skipping (create it in Kit to enable tagging)`);
            continue;
          }
          const tagRes = await call(creds.apiKey, `/tags/${match.id}/subscribers`, {
            method: "POST",
            body: JSON.stringify({ email_address: contact.email }),
          });
          if (!tagRes.ok) throw new Error(`Kit tag ${tagRes.status}`);
        }
      }
    }
  },
};
```

- [ ] **Step 4: Run, verify pass.** Then run the whole suite + types: `npm test && npx tsc --noEmit` (all green; the registry from Task 3 now resolves).
- [ ] **Step 5: Commit** `git add src/lib/integrations/kit.ts src/lib/integrations/kit.test.ts && git commit -m "feat: Kit (ConvertKit) ESP adapter"`

---

## Task 6: Connection store helper + esp_push dispatch

**Files:** Create `src/lib/integrations/store.ts`; modify `src/lib/delivery/outbox.ts`.

- [ ] **Step 1: Write `src/lib/integrations/store.ts`**

```ts
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { EspProvider } from "@/lib/types";
import { decryptSecret } from "./crypto";
import { getAdapter } from "./index";
import type { EspContact } from "./types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

// Load a connection (admin), decrypt its key, and push the contact to targetId.
// Throws on any failure so the outbox records a retry. On an auth failure the
// caller marks the connection needs_reconnect.
export async function pushToIntegration(
  admin: AdminClient,
  integrationId: string,
  targetId: string,
  contact: EspContact,
): Promise<void> {
  const { data, error } = await admin
    .from("integrations")
    .select("provider, encrypted_credentials, status")
    .eq("id", integrationId)
    .maybeSingle();
  if (error) throw new Error(`integration lookup failed: ${error.message}`);
  if (!data) throw new Error("integration not found");
  const provider = data.provider as EspProvider;
  const apiKey = decryptSecret(data.encrypted_credentials as string);
  try {
    await getAdapter(provider).upsertSubscriber({ apiKey }, targetId, contact);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // A 401/403 means the stored key is bad; flag the connection for reconnect.
    if (/\b(401|403)\b/.test(msg)) {
      await admin
        .from("integrations")
        .update({ status: "needs_reconnect", last_error: msg.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", integrationId);
    }
    throw err;
  }
}
```

- [ ] **Step 2: Implement the `esp_push` branch in `src/lib/delivery/outbox.ts`.** The `dispatch()` function currently throws `unknown job kind` for `esp_push`. Add a branch BEFORE the final throw. The job payload shape (set by the leads route in Task 8) is `{ integrationId, targetId, contact: { email, name, tags } }`. The `dispatch` function does not have the admin client, but `processJob` does. Change `dispatch(job)` to `dispatch(admin, job)` and pass `admin` from `processJob`. Add:

```ts
  if (job.kind === "esp_push") {
    await pushToIntegration(
      admin,
      String(p.integrationId),
      String(p.targetId),
      p.contact as { email: string; name: string | null; tags: string[] },
    );
    return;
  }
```

Add the import `import { pushToIntegration } from "@/lib/integrations/store";` and update the `dispatch` signature + its single call site in `processJob` (`await dispatch(admin, job);`).

- [ ] **Step 3: Verify** `npx tsc --noEmit && npx eslint src/lib/integrations/store.ts src/lib/delivery/outbox.ts && npm test` (9 pass).
- [ ] **Step 4: Commit** `git add src/lib/integrations/store.ts src/lib/delivery/outbox.ts && git commit -m "feat: esp_push outbox dispatch via integration store"`

---

## Task 7: Integrations API routes

**Files:** Create `src/app/api/integrations/route.ts`, `src/app/api/integrations/[id]/route.ts`.

- [ ] **Step 1: Write `src/app/api/integrations/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/integrations";
import { encryptSecret } from "@/lib/integrations/crypto";

export const runtime = "nodejs";

// GET /api/integrations: the signed-in owner's connections (no secrets).
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data } = await supabase.from("integrations").select("id, provider, status").eq("owner_id", user.id);
  return NextResponse.json({ integrations: data ?? [] });
}

const ConnectSchema = z.object({
  provider: z.enum(["kit", "mailchimp"]),
  apiKey: z.string().min(8).max(500),
});

// POST /api/integrations: validate a pasted API key, store it encrypted, and
// return the connection id + the owner's target lists/forms to choose from.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = ConnectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 422 });

  const adapter = getAdapter(parsed.data.provider);
  const valid = await adapter.validateCredentials({ apiKey: parsed.data.apiKey });
  if (!valid.ok) return NextResponse.json({ error: valid.error ?? "Could not connect" }, { status: 422 });

  const { data, error } = await supabase
    .from("integrations")
    .upsert(
      {
        owner_id: user.id,
        provider: parsed.data.provider,
        encrypted_credentials: encryptSecret(parsed.data.apiKey),
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,provider" },
    )
    .select("id, provider, status")
    .single();
  if (error) return NextResponse.json({ error: "Could not save connection" }, { status: 500 });

  const targets = await adapter.listTargets({ apiKey: parsed.data.apiKey }).catch(() => []);
  return NextResponse.json({ integration: data, targets });
}
```

- [ ] **Step 2: Write `src/app/api/integrations/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getAdapter } from "@/lib/integrations";
import { decryptSecret } from "@/lib/integrations/crypto";
import type { EspProvider } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/integrations/[id]/... is not used; targets are re-fetched here.
// GET /api/integrations/[id]: re-list this connection's target lists/forms.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  // RLS ensures the row belongs to the user; read the encrypted key with the
  // admin client (RLS does not block the user, but the key must be decrypted
  // server-side only).
  const owned = await supabase.from("integrations").select("id").eq("id", id).maybeSingle();
  if (!owned.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("integrations").select("provider, encrypted_credentials").eq("id", id).single();
  const adapter = getAdapter(data!.provider as EspProvider);
  const targets = await adapter.listTargets({ apiKey: decryptSecret(data!.encrypted_credentials as string) }).catch(() => []);
  return NextResponse.json({ targets });
}

// DELETE /api/integrations/[id]: disconnect. RLS scopes to the owner.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { error } = await supabase.from("integrations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Could not disconnect" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify** `npx tsc --noEmit && npx eslint src/app/api/integrations/route.ts "src/app/api/integrations/[id]/route.ts" && npm run build` (routes appear). Local smoke: unauthenticated `GET /api/integrations` returns 401.
- [ ] **Step 4: Commit** `git add src/app/api/integrations && git commit -m "feat: integrations connect/list/disconnect API"`

---

## Task 8: Wire destinations into the quiz PATCH + leads route

**Files:** Modify `src/app/api/quizzes/[id]/route.ts`, `src/app/api/leads/route.ts`.

- [ ] **Step 1: Accept `destinations` in the PATCH delivery schema (`src/app/api/quizzes/[id]/route.ts`).** Add a Zod schema and include it in the delivery rebuild (next to `followUp`):

```ts
const DestinationsSchema = z.array(
  z.object({
    integrationId: z.string().uuid(),
    provider: z.enum(["kit", "mailchimp"]),
    targetId: z.string().min(1),
    targetName: z.string().max(200),
  }),
).max(5);
```
Add `destinations: DestinationsSchema.optional(),` to `UpdateQuizSchema`, add `v.destinations !== undefined ||` to the refine, and in the delivery-building block add `if (parsed.data.destinations !== undefined) delivery.destinations = parsed.data.destinations;` (the editor sends whatsapp + webhook + followUp + destinations together, so the rebuild keeps all).

- [ ] **Step 2: Enqueue `esp_push` jobs in the leads route (`src/app/api/leads/route.ts`).** Where `delivery` is destructured, add `destinations?: QuizDestination[]` to the type (import `QuizDestination` from `@/lib/types`). After the follow-up job block, add:

```ts
    for (const dest of delivery.destinations ?? []) {
      jobs.push({
        lead_id: leadId,
        owner_id: quiz.owner_id,
        kind: "esp_push",
        target: dest.integrationId,
        payload: {
          integrationId: dest.integrationId,
          targetId: dest.targetId,
          contact: {
            email,
            name: cleanName,
            // Tag the subscriber by outcome (and quiz title) so the owner can
            // segment. Empty entries are filtered so a missing outcome is fine.
            tags: [outcomeName, quiz.title].filter((t): t is string => Boolean(t)),
          },
        },
      });
    }
```

- [ ] **Step 3: Verify** `npx tsc --noEmit && npx eslint "src/app/api/quizzes/[id]/route.ts" src/app/api/leads/route.ts && npm run build && npm test`.
- [ ] **Step 4: Commit** `git add "src/app/api/quizzes/[id]/route.ts" src/app/api/leads/route.ts && git commit -m "feat: enqueue esp_push per quiz destination on lead capture"`

---

## Task 9: Editor connect + destination UI

**Files:** Modify `src/components/QuizSettings.tsx`, `src/components/EditQuizClient.tsx`, `src/app/edit/[id]/page.tsx`.

Read all three first. Follow the existing follow-up/webhook card patterns and the `.editor-ui` styling.

- [ ] **Step 1: Add an "Integrations" card to `QuizSettings.tsx`.** New props: `destinations: QuizDestination[]`, `onDestinations: (next: QuizDestination[]) => void`. Behavior:
  - On mount (or when the card opens) it `GET /api/integrations` to list the owner's connections (id, provider, status).
  - A "Connect Kit" / "Connect Mailchimp" control: clicking reveals an API-key input + Connect button that `POST /api/integrations { provider, apiKey }`. On success it stores nothing client-side except the returned connection + `targets`, and shows a target (list/form) dropdown.
  - For this quiz, the owner picks a connection + target; selecting it pushes `{ integrationId, provider, targetId, targetName }` into `destinations` via `onDestinations`. Show currently-selected destinations with a remove control.
  - A `needs_reconnect` connection shows a "Reconnect" prompt (re-paste key).
  - Never display or store the API key after submit; the input is cleared on success.
  - Use only `fetch` to the routes from Task 7. Keep copy free of em dashes.

- [ ] **Step 2: Wire state + save in `EditQuizClient.tsx`.** Add `destinations` state from a new `initialDestinations: QuizDestination[]` prop, an `editDestinations` handler that marks the editor dirty, include `destinations` in the PATCH save body alongside whatsapp/webhook/followUp, and pass `destinations`/`onDestinations` to `QuizSettings`.

- [ ] **Step 3: Pass initial value in `src/app/edit/[id]/page.tsx`:** `initialDestinations={(data.delivery as { destinations?: QuizDestination[] } | null)?.destinations ?? []}` (import `QuizDestination` from `@/lib/types`).

- [ ] **Step 4: Verify** `npx tsc --noEmit && npx eslint <the three files> && npm run build`, then grep all three for em dashes.
- [ ] **Step 5: Runtime smoke (local, needs a real ESP key):** connect a provider, pick a list/form, save, publish, complete the quiz, and confirm the lead appears as a subscriber tagged by outcome, with the `esp_push` `delivery_jobs` row reaching `done`.
- [ ] **Step 6: Commit** `git add src/components/QuizSettings.tsx src/components/EditQuizClient.tsx src/app/edit/[id]/page.tsx && git commit -m "feat: editor ESP connect + per-quiz destination UI"`

---

## Final verification

- [ ] `npm test` (crypto + adapter unit tests pass), `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- [ ] `grep -rn "—" src/lib/integrations src/app/api/integrations` returns nothing (em-dash rule).
- [ ] Coordinator: set `INTEGRATIONS_ENC_KEY` (`openssl rand -base64 32`) in Vercel production before the esp_push path runs in prod.
- [ ] End-to-end with a real Kit and/or Mailchimp account: connect -> pick target -> publish -> complete -> subscriber created + tagged + `esp_push` job `done`.
- [ ] Do NOT auto-merge/deploy; leave on the branch for review unless the user asks to ship.

## Notes / deferred to Phase 3
- MailerLite + Brevo adapters (same interface, two more files + registry entries).
- Custom sending domain (Resend Domains API, Pro-gated).
- Creating Kit tags on the fly (v1 only tags against existing tags).
- Richer custom-field mapping (score, per-category, answers) beyond the outcome tag.
- Gating: ESP integration is free in v1 (the anti-involve.me "do not gate the core" stance); revisit if abuse appears.
