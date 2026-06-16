# Email ESP Integrations Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round out the integrations feature: Kit auto-creates tags, the outcome rides as a custom field (so tag-less ESPs capture the segment), add MailerLite + Brevo, and let Pro owners send the follow-up email from their own verified domain.

**Architecture:** Extends the Phase 2 adapter dock (`src/lib/integrations/`) and the Phase 1 follow-up sender (`src/lib/email.ts`). Two halves: **Part A** (Kit auto-tag, `EspContact.fields`, MailerLite + Brevo adapters, register + UI) extends the existing `EmailDestination` pattern; **Part B** (custom sending domain) adds a `sending_domains` table, a Resend Domains API client, provision/verify routes + editor UI, and wires `resolveFollowUpSender` to use a verified domain for Pro owners.

**Tech Stack:** Next 16 route handlers; Supabase Postgres; `fetch` adapters (MailerLite `connect.mailerlite.com/api`, Brevo `api.brevo.com/v3`); Resend Domains API; existing AES-256-GCM crypto + outbox + follow-up email; vitest. No new paid services for Part A; Part B's custom domain is where Resend cost scales (hence Pro-gated).

**Scope note:** Phase 3 of `docs/superpowers/specs/2026-06-16-email-integration-design.md`, plus two items deferred from Phase 2 (Kit auto-tag, richer field mapping). Part A and Part B are independently shippable; do A first.

**Verified provider APIs (June 2026):**
- **MailerLite:** base `https://connect.mailerlite.com/api`, `Authorization: Bearer {token}`, `Accept: application/json`. Upsert: `POST /subscribers` body `{ email, fields: {name, ...custom}, groups: [groupId] }` (non-destructive upsert by email). Targets (groups): `GET /groups?limit=100` -> `{ data: [{ id, name }] }`. Validate: `GET /groups?limit=1`. MailerLite has no tags; the chosen group is the target and the outcome goes in a custom field.
- **Brevo:** base `https://api.brevo.com/v3`, header `api-key: {key}`. Upsert: `POST /contacts` body `{ email, attributes: {FIRSTNAME, ...}, listIds: [id], updateEnabled: true }`. Targets (lists): `GET /contacts/lists?limit=50` -> `{ lists: [{ id, name }] }`. Validate: `GET /account`. Brevo has no tags; the chosen list is the target and the outcome goes in an attribute.
- **Resend Domains:** `POST /domains { name }` -> `{ id, status, records: [{ record, name, type, value, status }] }`; verify `POST /domains/{id}/verify`; status `GET /domains/{id}`. Auth: `Authorization: Bearer ${RESEND_API_KEY}`.
- **Kit create tag:** `POST /v4/tags { name }` -> `{ tag: { id, name } }` (header `X-Kit-Api-Key`).

**Project conventions (carried forward):** NO em dashes anywhere; server-only modules for secrets; `fetch`-only adapters with 5s `AbortController` + `redirect: "manual"`; verify each task with tsc + eslint + (where noted) `npm test` / `npm run build`.

---

# PART A: more providers + field mapping

## Task 1: Kit auto-create-tag

**Files:** `src/lib/integrations/kit.ts`, `src/lib/integrations/kit.test.ts`.

When tagging, if no tag matches a name, CREATE it via `POST /v4/tags { name }` then add the subscriber, instead of skipping.

- [ ] **Step 1: Update the test** in `kit.test.ts` "skips tagging" -> replace with "creates a missing tag then tags": when `/tags` GET returns no match, expect a `POST /v4/tags` call, then a `POST /v4/tags/{newId}/subscribers`. Mock the create to return `{ tag: { id: 77, name } }`.

```ts
  it("creates a missing tag, then applies it", async () => {
    const calls: { url: string; method: string }[] = [];
    mockFetch((url, init) => {
      calls.push({ url, method: (init.method as string) ?? "GET" });
      if (url.endsWith("/v4/tags") && (init.method ?? "GET") === "GET")
        return new Response(JSON.stringify({ tags: [] }), { status: 200 });
      if (url.endsWith("/v4/tags") && init.method === "POST")
        return new Response(JSON.stringify({ tag: { id: 77, name: "Beginner" } }), { status: 201 });
      return new Response("{}", { status: 200 });
    });
    await kit.upsertSubscriber({ apiKey: "k" }, "form55", { email: "a@b.com", name: "A", tags: ["Beginner"], fields: {} });
    expect(calls.some((c) => c.url.endsWith("/v4/tags") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/v4/tags/77/subscribers"))).toBe(true);
  });
```
(Note: the `fields` arg is added in Task 2; if Task 2 is done first, keep it; otherwise drop `fields` here and add in Task 2.)

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** In `kit.ts` `upsertSubscriber`, replace the `if (!match) { warn; continue; }` block with a create-then-use:
```ts
        let tagId = match?.id;
        if (tagId === undefined) {
          const created = await call(creds.apiKey, "/tags", {
            method: "POST",
            body: JSON.stringify({ name: tagName }),
          });
          if (!created.ok) throw new Error(`Kit create tag ${created.status}`);
          const body = (await created.json()) as { tag?: { id: number } };
          if (!body.tag) throw new Error("Kit create tag returned no tag");
          tagId = body.tag.id;
        }
        const tagRes = await call(creds.apiKey, `/tags/${tagId}/subscribers`, {
          method: "POST",
          body: JSON.stringify({ email_address: contact.email }),
        });
        if (!tagRes.ok) throw new Error(`Kit tag ${tagRes.status}`);
```
- [ ] **Step 4: Run, verify pass; `npx tsc --noEmit`.**
- [ ] **Step 5: Commit** `git commit -m "feat: Kit adapter auto-creates a missing tag"`

## Task 2: EspContact.fields + map in Mailchimp/Kit + leads route

**Files:** `src/lib/integrations/types.ts`, `mailchimp.ts`, `kit.ts`, `src/app/api/leads/route.ts`, the adapter tests.

Add `fields: Record<string, string>` to `EspContact` so tag-less providers can carry the outcome, and so future fields (score) have a home.

- [ ] **Step 1: Extend the interface** in `types.ts`:
```ts
export interface EspContact {
  email: string;
  name: string | null;
  tags: string[];
  fields: Record<string, string>; // e.g. { outcome: "...", quiz: "..." }
}
```
- [ ] **Step 2: Mailchimp** `upsertSubscriber`: merge `fields` into `merge_fields` (uppercased keys, Mailchimp convention). Build merge_fields from name + fields:
```ts
    const merge: Record<string, string> = {};
    if (contact.name) merge.FNAME = contact.name;
    for (const [k, v] of Object.entries(contact.fields)) merge[k.toUpperCase()] = v;
    // ...use `merge_fields: merge` in the PUT body (omit if empty)
```
(Note: Mailchimp ignores merge fields that do not exist on the audience; that is fine, no error.)
- [ ] **Step 3: Kit** `upsertSubscriber`: pass `fields` to the subscriber upsert (Kit custom fields are keyed by field key):
```ts
    body: JSON.stringify({ email_address: contact.email, first_name: contact.name ?? undefined, fields: contact.fields }),
```
(Kit returns 422 for unknown field keys; to stay safe, only send fields the owner has, or wrap in try and ignore a 422 on fields. For v1, send `fields` and let the subscriber upsert proceed; if this proves brittle, gate behind known keys. Document this.)
- [ ] **Step 4: Leads route** (`src/app/api/leads/route.ts`): in the `esp_push` job's `contact`, add `fields`:
```ts
          contact: {
            email,
            name: cleanName,
            tags: [outcomeName, quiz.title].filter((t): t is string => Boolean(t)),
            fields: {
              ...(outcomeName ? { outcome: outcomeName } : {}),
              ...(quiz.title ? { quiz: quiz.title } : {}),
            },
          },
```
- [ ] **Step 5: Update adapter tests** to pass `fields: {}` (or a sample) in the `upsertSubscriber` calls so they compile, and add one assertion that Mailchimp includes the outcome in merge_fields when provided.
- [ ] **Step 6: Verify** `npm test`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 7: Commit** `git commit -m "feat: carry outcome as an ESP custom field (EspContact.fields)"`

## Task 3: MailerLite adapter

**Files:** `src/lib/integrations/mailerlite.ts` + `.test.ts`.

Mirror the Mailchimp/Kit adapter shape exactly (server-only, `call()` with 5s timeout + redirect manual). Implement against the verified MailerLite API.

- [ ] **Step 1: Write `mailerlite.test.ts`** (mock fetch): validate via `GET /api/groups?limit=1` (Bearer header), `listTargets` maps `data[]` to `{id,name}`, `upsertSubscriber` POSTs `/api/subscribers` with `email`, `fields` (incl. name), and `groups: [targetId]`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `mailerlite.ts`:**
```ts
import "server-only";
import type { EmailDestination, EspContact, EspCredentials, EspTarget } from "./types";

const BASE = "https://connect.mailerlite.com/api";

async function call(token: string, path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const mailerlite: EmailDestination = {
  id: "mailerlite",
  label: "MailerLite",
  async validateCredentials(creds: EspCredentials) {
    try {
      const res = await call(creds.apiKey, "/groups?limit=1");
      return res.ok ? { ok: true } : { ok: false, error: `MailerLite returned ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "request failed" };
    }
  },
  async listTargets(creds: EspCredentials): Promise<EspTarget[]> {
    const res = await call(creds.apiKey, "/groups?limit=100");
    if (!res.ok) throw new Error(`MailerLite groups ${res.status}`);
    const data = (await res.json()) as { data?: { id: string; name: string }[] };
    return (data.data ?? []).map((g) => ({ id: String(g.id), name: g.name }));
  },
  async upsertSubscriber(creds: EspCredentials, targetId: string, contact: EspContact) {
    const fields: Record<string, string> = { ...contact.fields };
    if (contact.name) fields.name = contact.name;
    const res = await call(creds.apiKey, "/subscribers", {
      method: "POST",
      body: JSON.stringify({ email: contact.email, fields, groups: [targetId] }),
    });
    if (!res.ok) throw new Error(`MailerLite upsert ${res.status}`);
  },
};
```
(No tags: the outcome rides in `fields`. The chosen group is the target.)
- [ ] **Step 4: Run, verify pass; tsc.**
- [ ] **Step 5: Commit** `git commit -m "feat: MailerLite ESP adapter"`

## Task 4: Brevo adapter

**Files:** `src/lib/integrations/brevo.ts` + `.test.ts`. Same shape.

- [ ] **Step 1: Write `brevo.test.ts`:** validate via `GET /account` (header `api-key`), `listTargets` maps `lists[]`, `upsertSubscriber` POSTs `/contacts` with `email`, `attributes`, `listIds: [Number(targetId)]`, `updateEnabled: true`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `brevo.ts`:**
```ts
import "server-only";
import type { EmailDestination, EspContact, EspCredentials, EspTarget } from "./types";

const BASE = "https://api.brevo.com/v3";

async function call(key: string, path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json", ...(init?.headers ?? {}) },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const brevo: EmailDestination = {
  id: "brevo",
  label: "Brevo",
  async validateCredentials(creds: EspCredentials) {
    try {
      const res = await call(creds.apiKey, "/account");
      return res.ok ? { ok: true } : { ok: false, error: `Brevo returned ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "request failed" };
    }
  },
  async listTargets(creds: EspCredentials): Promise<EspTarget[]> {
    const res = await call(creds.apiKey, "/contacts/lists?limit=50");
    if (!res.ok) throw new Error(`Brevo lists ${res.status}`);
    const data = (await res.json()) as { lists?: { id: number; name: string }[] };
    return (data.lists ?? []).map((l) => ({ id: String(l.id), name: l.name }));
  },
  async upsertSubscriber(creds: EspCredentials, targetId: string, contact: EspContact) {
    const attributes: Record<string, string> = {};
    if (contact.name) attributes.FIRSTNAME = contact.name;
    for (const [k, v] of Object.entries(contact.fields)) attributes[k.toUpperCase()] = v;
    const res = await call(creds.apiKey, "/contacts", {
      method: "POST",
      body: JSON.stringify({ email: contact.email, attributes, listIds: [Number(targetId)], updateEnabled: true }),
    });
    if (!res.ok) throw new Error(`Brevo upsert ${res.status}`);
  },
};
```
- [ ] **Step 4: Run, verify pass; tsc.**
- [ ] **Step 5: Commit** `git commit -m "feat: Brevo ESP adapter"`

## Task 5: Register MailerLite + Brevo (provider enum, constraint, registry, UI)

**Files:** `src/lib/types.ts`, `src/lib/integrations/index.ts`, `src/app/api/integrations/route.ts`, `src/app/api/quizzes/[id]/route.ts`, `src/components/QuizSettings.tsx`, plus a migration.

- [ ] **Step 1: Widen the provider type** in `types.ts`: `export type EspProvider = "kit" | "mailchimp" | "mailerlite" | "brevo";`
- [ ] **Step 2: Migration `supabase/migrations/0012_more_providers.sql`** to widen the check constraint:
```sql
alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in ('kit', 'mailchimp', 'mailerlite', 'brevo'));
```
(Coordinator applies via Supabase MCP.)
- [ ] **Step 3: Registry** (`index.ts`): import + add `mailerlite` and `brevo` to the `ADAPTERS` record and `ALL_ADAPTERS`.
- [ ] **Step 4: Zod enums**: update `ConnectSchema` (integrations route) and `DestinationsSchema` (quizzes PATCH route) provider enums to include `"mailerlite", "brevo"`.
- [ ] **Step 5: Connect UI** (`QuizSettings.tsx` IntegrationsCard): add "Connect MailerLite" and "Connect Brevo" buttons for unconnected providers (the card already maps over providers; extend the provider list it renders, ideally driven by a small `[{id,label}]` array so all four render uniformly).
- [ ] **Step 6: Verify** `npm test`, `npx tsc --noEmit`, `npm run build`. Coordinator applies migration 0012 and confirms the constraint.
- [ ] **Step 7: Commit** `git commit -m "feat: register MailerLite + Brevo providers (enum, constraint, registry, UI)"`

---

# PART B: custom sending domain (Pro-gated)

## Task 6: sending_domains table + types

**Files:** `supabase/migrations/0013_sending_domains.sql`, `src/lib/types.ts`.

- [ ] **Step 1: Migration:**
```sql
-- Account-level custom sending domain for follow-up emails (Pro feature).
-- resend_domain_id ties to the Resend Domains API; status mirrors Resend's.
create table if not exists public.sending_domains (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  domain text not null,
  from_local text not null default 'hello',
  resend_domain_id text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'failed')),
  dns_records jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);
alter table public.sending_domains enable row level security;
create policy "own sending_domain select" on public.sending_domains for select using (owner_id = auth.uid());
create policy "own sending_domain insert" on public.sending_domains for insert with check (owner_id = auth.uid());
create policy "own sending_domain update" on public.sending_domains for update using (owner_id = auth.uid());
create policy "own sending_domain delete" on public.sending_domains for delete using (owner_id = auth.uid());
```
(Coordinator applies.)
- [ ] **Step 2: Types** in `types.ts`:
```ts
export interface SendingDomain {
  id: string;
  domain: string;
  from_local: string;
  status: "pending" | "verified" | "failed";
  dns_records: { record: string; name: string; type: string; value: string; status: string }[];
}
```
- [ ] **Step 3: tsc + commit** `git commit -m "feat: sending_domains table + type"`

## Task 7: Resend Domains API client

**Files:** `src/lib/email/domains.ts` (new) + `.test.ts`.

- [ ] **Step 1: Tests** (mock fetch): `createResendDomain(name)` POSTs `/domains` with Bearer RESEND_API_KEY and returns `{id, status, records}`; `verifyResendDomain(id)` POSTs `/domains/{id}/verify`; `getResendDomain(id)` GETs `/domains/{id}`.
- [ ] **Step 2: Implement:**
```ts
import "server-only";

const BASE = "https://api.resend.com";

function key(): string {
  const k = process.env.RESEND_API_KEY;
  if (!k) throw new Error("RESEND_API_KEY is not set");
  return k;
}

export interface ResendDomain {
  id: string;
  status: string;
  records: { record: string; name: string; type: string; value: string; status: string }[];
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function createResendDomain(name: string): Promise<ResendDomain> {
  const res = await call("/domains", { method: "POST", body: JSON.stringify({ name }) });
  if (!res.ok) throw new Error(`Resend create domain ${res.status}`);
  return (await res.json()) as ResendDomain;
}

export async function verifyResendDomain(id: string): Promise<void> {
  const res = await call(`/domains/${id}/verify`, { method: "POST" });
  if (!res.ok) throw new Error(`Resend verify ${res.status}`);
}

export async function getResendDomain(id: string): Promise<{ status: string }> {
  const res = await call(`/domains/${id}`);
  if (!res.ok) throw new Error(`Resend get domain ${res.status}`);
  return (await res.json()) as { status: string };
}
```
- [ ] **Step 3: Verify + commit** `git commit -m "feat: Resend Domains API client"`

## Task 8: Custom domain API routes (Pro-gated)

**Files:** `src/app/api/sending-domain/route.ts` (GET status, POST add, DELETE remove), `src/app/api/sending-domain/verify/route.ts` (POST verify).

- [ ] **Step 1:** `POST /api/sending-domain` (authed, non-guest, **Pro only** via `effectivePlan`/`hasProFeatures` from `src/lib/plan.ts`): body `{ domain }`. Call `createResendDomain(domain)`, store row (resend_domain_id, dns_records, status mapped). Free users get 403 with `reason: "plan_required"` + a `paywall_hit { trigger: "custom_domain" }` builder_event. Return the dns_records for display.
- [ ] **Step 2:** `GET /api/sending-domain` returns the owner's sending domain row (status + dns_records) or null.
- [ ] **Step 3:** `POST /api/sending-domain/verify` calls `verifyResendDomain(resend_domain_id)` then `getResendDomain` and updates `status` to `verified` when Resend reports it; returns the new status.
- [ ] **Step 4:** `DELETE /api/sending-domain` removes the row (and optionally the Resend domain).
- [ ] **Step 5: Verify (tsc/eslint/build); local 401/403 checks; commit** `git commit -m "feat: custom sending domain API (Pro-gated)"`

## Task 9: Wire the verified domain into follow-up sending

**Files:** `src/app/api/leads/route.ts`.

- [ ] **Step 1:** When building the `follow_up_email` job and `followUp.sender.mode === "custom_domain"`, look up the owner's `sending_domains` row; if `status === "verified"` AND the owner is Pro (`effectivePlan`), set `customFrom = "<from_local>@<domain>"` and pass it to `resolveFollowUpSender` (which already falls back to the subdomain when `customFrom` is null). Otherwise leave `customFrom` null (subdomain fallback).
- [ ] **Step 2: Verify (tsc/build); commit** `git commit -m "feat: send follow-up from the owner's verified custom domain when Pro"`

## Task 10: Custom domain editor UI

**Files:** `src/components/QuizSettings.tsx` (or a small `SendingDomainCard`), `EditQuizClient.tsx` if state is needed.

- [ ] **Step 1:** In the follow-up email card's sender setting, add a "Use my own domain" option (Pro). For Pro owners: an input to add a domain (`POST /api/sending-domain`), a display of the returned DNS records to add, a "Verify" button (`POST /api/sending-domain/verify`) that updates the shown status, and the `sender.mode` toggle that selects subdomain vs custom_domain for this quiz. Free owners see an "Upgrade to Pro" link (mirror the branding gate pattern). Em-dash free; reuse existing card styling.
- [ ] **Step 2: Verify (tsc/eslint/build); commit** `git commit -m "feat: custom sending domain editor UI"`

---

## Final verification
- [ ] `npm test`, `npx tsc --noEmit`, `npx eslint .`, `npm run build`.
- [ ] `grep -rn "—"` across new files returns nothing.
- [ ] Coordinator applies migrations 0012 + 0013 and confirms.
- [ ] Final integration review (the esp_push contact.fields flows to all four adapters; custom-domain sender resolution is Pro-gated and falls back cleanly).
- [ ] End-to-end (manual, needs real accounts + a real domain): connect MailerLite + Brevo, complete a quiz, confirm tagged/fielded subscriber; add a custom domain, add DNS, verify, send a follow-up from it.
- [ ] Do NOT auto-merge/deploy; leave on the branch for review unless the user asks to ship.

## Notes
- Part A is fully testable without external accounts (mocked fetch) and ships value on its own. Part B (custom domain) needs a real domain + DNS to truly verify and is where Resend cost scales, hence Pro-gating.
- MailerLite/Brevo have no native "tags"; the outcome rides in a custom field/attribute. Owners segment via the chosen group/list + that field.
