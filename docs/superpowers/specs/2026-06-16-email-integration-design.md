# Email Integration + Personalized Follow-up Design

**Date:** 2026-06-16
**Status:** Approved direction, pending spec review

## Goal

Let a quiz owner connect their existing email tool and automatically send one reliable, personalized, result-aware follow-up email to every lead, with the lead's quiz outcome data carried through to both. This is the "post-capture" layer that turns Treeflow from "collects leads" into "feeds my funnel," positioned against involve.me.

## Strategic context (from research)

Two research passes (the deep-research workflow + the external compass artifact) converged on:

- involve.me's native email automation only soft-launched Dec 2025 and has **near-zero verified user validation**. Historically users treated involve.me as capture + one email, then nurtured in their own ESP. So a heavy native automation suite is **not** the proven need.
- The demonstrated need is **capture that hands off cleanly to the ESP the owner already uses**, plus **differentiated nurture per outcome tier**, with every lead arriving **tagged by outcome and carrying score/answers**.
- involve.me's real, repeated weak points: flaky delivery ("Zapier doesn't integrate well," manual tasks), a `no-reply@involveme.com` sender, and aggressive feature-gating.

**Therefore Treeflow differentiates on:** reliable delivery (transactional outbox + retries), deliverability + brand (owner's own sending domain), deep per-outcome personalization, and not gating the core capture-to-handoff value. We do **not** build an involve.me-style automation suite in v1.

## Scope

**In:**
- Native ESP integrations via an adapter framework. v1 providers: **Kit/ConvertKit, Mailchimp, MailerLite, Brevo** (the coach-ESP set both research passes converge on).
- A transactional outbox delivery pipeline with immediate (`after()`) processing and a per-minute Supabase `pg_cron` retry sweeper.
- One personalized, per-outcome follow-up email to the lead, sent via Resend.
- Owner sending domain: branded subdomain fallback for everyone; **own custom domain (Pro-gated)** via Resend's Domains API.
- Editor UI to connect an ESP and author per-outcome follow-up emails (with AI draft).

**Out (deferred):**
- Multi-step / branching email sequences (the involve.me suite). Revisit only if retention data shows demand.
- OAuth "Connect" flows (v1 uses API keys).
- Additional providers beyond the four (HubSpot, Klaviyo, GoHighLevel, ActiveCampaign); these are fast-follow adapters.
- Owner-custom SMTP credentials (Resend covers sending).

## Architecture overview

Lead capture stays synchronous and authoritative (the lead row is the source of truth and must never be lost). All **delivery** moves to a transactional outbox so every channel gets retries and observability:

```
POST /api/leads
  1. validate + insert lead row  (synchronous, authoritative)
  2. enqueue delivery_jobs rows: { esp_push per destination, follow_up_email, owner_notify, webhook }
  3. respond 200 to the visitor immediately
  4. after(): process this lead's pending jobs now (non-blocking, near-instant)
Supabase pg_cron (every minute) -> POST /api/cron/deliver-outbox (Bearer CRON_SECRET)
  -> picks pending/failed jobs past send_after, retries with exponential backoff, dead-letters after N attempts
```

The existing inline owner-notify email and webhook delivery migrate into the outbox as job kinds, so all delivery is uniform and reliable. The lead INSERT itself is untouched and stays in-request.

## Components

### 1. Integration adapter framework (the "dock")

- `src/lib/integrations/types.ts` defines an `EmailDestination` interface:
  - `id` (e.g. `"kit"`), `label`, `authKind: "api_key"`
  - `validateCredentials(creds): Promise<{ ok: boolean; error?: string }>` runs a cheap authenticated call to confirm the key works at save time
  - `listTargets(creds): Promise<{ id: string; name: string }[]>` fetches the owner's lists/forms/groups to pick from
  - `upsertSubscriber(creds, config, contact): Promise<void>` subscribes or upserts with email, name, tags, custom fields, consent
- One adapter file per provider (`kit.ts`, `mailchimp.ts`, `mailerlite.ts`, `brevo.ts`), each using `fetch` against the provider REST API. No vendor SDKs (minimal deps, no lock-in).
- `src/lib/integrations/index.ts` holds the registry mapping provider id -> adapter, plus `getAdapter(id)`.
- The `contact` payload always includes: `email`, `name`, `tags` (outcome name + quiz title), and `fields` (score, per-category scores, outcome/tier, selected answers). The minimum-viable mapping is "subscribe to the chosen list + tag = outcome"; typed custom fields are mapped where the provider supports them.

### 2. Credential storage

- New table `integrations` (account-level; connect once, reuse on any quiz):
  - `id uuid pk`, `owner_id uuid -> profiles(id)`, `provider text`, `encrypted_credentials text`, `config jsonb` (e.g. default list id), `status text` (`active` | `needs_reconnect`), `last_error text`, `created_at`, `updated_at`
  - RLS: owner-only (`owner_id = auth.uid()`), as defense in depth. Decryption happens server-side only via the admin client; the encrypted blob and key never reach the client.
- Encryption: AES-256-GCM via `node:crypto` (zero new deps, same app-side-crypto posture as `src/lib/transferToken.ts`). Master key in a new Vercel env var `INTEGRATIONS_ENC_KEY` (32 bytes, base64). Store `iv:authTag:ciphertext`.
- Per-quiz wiring lives in the quiz `delivery` jsonb: `delivery.destinations: [{ integrationId, listId, tag? }]`, so a quiz references an account-level connection plus the list/tag for that quiz.

### 3. Delivery pipeline (transactional outbox)

- New table `delivery_jobs`:
  - `id uuid pk`, `lead_id uuid -> leads(id)`, `owner_id uuid`, `kind text` (`esp_push` | `follow_up_email` | `owner_notify` | `webhook`), `target text` (integration id / channel), `payload jsonb` (snapshot taken at enqueue so retries are deterministic), `status text` (`pending` | `done` | `failed` | `dead`), `attempts int`, `max_attempts int default 6`, `send_after timestamptz`, `last_error text`, `created_at`, `updated_at`
  - RLS: service-role only (no user policies); written/read by the admin client. Indexed on `(status, send_after)`.
- `src/lib/delivery/outbox.ts` exposes `enqueue(jobs)`, `processJob(job)` (dispatches by kind), and `claimDueJobs(limit)` (atomic claim to avoid double-processing across `after()` + cron).
- Immediate path: `after()` in `/api/leads` calls the worker for that lead's jobs.
- Retry path: `/api/cron/deliver-outbox` (Bearer `CRON_SECRET`, like the existing crons) claims due jobs, processes, applies exponential backoff (`send_after = now + base * 2^attempts`), dead-letters at `max_attempts`.
- Driven by **Supabase `pg_cron` every minute** calling the endpoint via `pg_net` http_post (free on all Supabase plans; removes the Vercel Hobby once-per-day limit). Vercel Pro cron is the noted alternative.
- A 401/403 from an ESP marks the `integrations` row `needs_reconnect` and dead-letters the job (no point retrying a bad key); surfaced in the editor.

### 4. Follow-up email (personalized, per-outcome)

- Sent via Resend (already integrated; SPF/DKIM verified on `contact.treeflow.tech`).
- **Sender resolution:**
  - Default (free, everyone): `from: "{brand_name} <leads@contact.treeflow.tech>"`, `reply_to: owner_email`. Branded + replies reach the owner, beating a `no-reply@` sender.
  - Custom domain (**Pro-gated**): owner adds their domain; we provision it via the **Resend Domains API**, surface the returned DKIM/SPF/DMARC records for them to add to DNS, poll the verify endpoint, and once verified send from `{local}@{their_domain}` with aligned DKIM. Not verified or not Pro -> automatic subdomain fallback.
- **Personalization (imperative):**
  - **Per-outcome content:** each quiz outcome has its own subject + body, stored in the quiz `delivery` jsonb keyed by outcome id (config stays quiz content; delivery stays delivery settings). The "Fitness Beginner" and "Advanced" results get genuinely different emails.
  - **Tokens:** `{{name}}`, `{{outcome}}`, `{{outcome_description}}`, `{{score}}`, `{{result_link}}`, `{{quiz_title}}`, `{{owner_name}}`, rendered per send.
  - **AI draft:** a button drafts per-outcome copy via the existing Anthropic pipeline from the quiz content; owner edits.
  - Token renderer escapes/handles missing values gracefully.
- **Compliance:** lead consent is already required (`consent: true`). The email includes clear sender identity and an unsubscribe/contact line (GDPR / EU). Suppress on unsubscribe.

### 5. Personalization through to the ESP

The `esp_push` job payload carries outcome, score, per-category scores, and answers, so subscribers land **tagged by outcome with score/answers as fields**, making the owner's downstream nurture personalized too. Personalization does not stop at our one email; it seeds their whole funnel.

### 6. Editor UX

Extend `src/components/QuizSettings.tsx` (already holds WhatsApp + webhook delivery):
- **Integrations block:** connect an ESP (pick provider -> paste API key -> validate -> choose list/tag), shows connection status, "needs reconnect" state.
- **Follow-up email block:** toggle on/off; per-outcome subject + body editors with token helper and the AI-draft button; sender setting (subdomain default, or "Use my domain" -> Pro gate -> DNS record flow).

## Plan gating

- **Free:** ESP integration + the personalized per-outcome follow-up email (from the branded subdomain). This is the core capture-to-handoff value; not gating it is the deliberate anti-involve.me wedge, and volume is already bounded by the free lead soft-cap (~100/mo).
- **Pro:** custom sending domain (own-domain deliverability + brand). Gated via the existing `effectivePlan()` / `hasProFeatures()`; a `paywall_hit { trigger: "custom_domain" }` builder_event fires on the gate.

## Data model changes

- Migration `0008_integrations.sql` creates the `integrations` table + RLS.
- Migration `0009_delivery_jobs.sql` creates the `delivery_jobs` table + indexes + service-role RLS.
- Migration `0010_pg_cron_outbox.sql` enables `pg_cron` + `pg_net` and schedules the per-minute http_post to `/api/cron/deliver-outbox`.
- Quiz config / `delivery` jsonb extended with `destinations[]` and per-outcome follow-up templates (subject/body) + sender setting. Validated via the existing Zod schema in the PATCH route.

## Error handling

- Lead INSERT failure -> 500, nothing enqueued (unchanged behavior). Delivery never blocks or fails the visitor response.
- Per-job retries with exponential backoff; dead-letter after `max_attempts`; `last_error` retained for debugging.
- Invalid ESP credentials (401/403) -> mark connection `needs_reconnect`, dead-letter, surface in editor.
- Email send failure -> retried via outbox; hard bounces suppressed.
- `validateCredentials` at save time catches bad keys before they ever reach the outbox.

## Security

- API keys encrypted at rest (AES-256-GCM), server-only decryption, RLS as defense in depth, never sent to client.
- ESP endpoints are known hosts (no SSRF surface like the webhook path); webhook channel keeps its existing `isSafeWebhookTarget` guard.
- `CRON_SECRET` bearer on the sweeper endpoint (existing pattern).
- No keys in logs or error messages. No em dashes anywhere (project rule).

## Testing

- Adapter unit tests with mocked `fetch` (subscribe, tag, validate, list) per provider.
- Encryption round-trip test.
- Outbox state-machine tests: enqueue -> claim -> success/failure -> backoff -> dead-letter; no double-processing across `after()` + cron.
- Token renderer + per-outcome selection tests.
- Follow-up sender resolution tests (subdomain fallback vs verified custom domain vs Pro gate).
- End-to-end against a provider sandbox/test account before launch.

## Build phasing (each phase shippable)

1. **Outbox + follow-up email.** `delivery_jobs`, `enqueue`/worker, `after()` wiring, Supabase `pg_cron` sweeper, migrate owner-notify + webhook into the outbox, per-outcome follow-up email from the subdomain with tokens + AI draft. Delivers personalized follow-up value with zero ESP work.
2. **Integration framework + first adapters.** `EmailDestination` interface, registry, `integrations` table + encryption, editor connect UI, Kit + Mailchimp adapters, `esp_push` job kind.
3. **Remaining adapters + custom domain.** MailerLite + Brevo adapters; custom sending domain via Resend Domains API, Pro-gated, with the DNS verification flow.

## Open questions / verify at build time

- Resend Domains API exact shape + free-tier domain/volume limits (drives when Resend cost kicks in; SES is the noted scale alternative).
- Supabase `pg_cron` + `pg_net` setup specifics (http_post auth header, scheduling syntax).
- Next 16 `after()` exact import/runtime behavior on Vercel Fluid Compute (read `node_modules/next/dist/docs/.../after.md` before implementing, per AGENTS.md).
- Per-provider API specifics: auth header, subscribe/upsert endpoint, tagging mechanism, custom-field support (Kit forms/tags, Mailchimp list + merge fields + tags, MailerLite groups, Brevo lists + attributes).
