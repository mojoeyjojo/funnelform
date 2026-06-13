# Phase 2 — Build Plan (sequenced)

Phase 1 (the URL/description → schema-valid quiz magic moment + instrumentation) is **done and at its gate**. Phase 2 turns the bare skeleton into a real product. This doc covers **Sub-phase 2A: Auth + Persistence (the foundation)** in detail, and sketches what comes immediately after.

> **Source of truth:** `docs/mvp-build-spec.md` (architecture), `docs/mvp-goal.md` (the five claims), `STYLE.md` (visual system), `supabase/migrations/0001_init.sql` (the data model — already created, Phase 2 just starts writing to it).
>
> **2026-06-13:** the final Phase 2 item (the design/UX pass) is specced in `docs/design-pass.md`, which reconciles an externally-written stage brief against the shipped state (design round 1, monetization, mandatory-signup funnel). Read that doc, not the external brief.

---

## Guiding decisions (locked)

1. **Value-first, not signup-first.** Anon user lands → generates → sees the magic → *then* hits "Create a free account to keep going" → auth → the just-generated quiz persists. The account wall comes **after** the magic moment. This is what Claim 2 (zero-touch onboarding — "the riskiest assumption") demands, and what STYLE.md's microcopy assumes. The Phase 1 anon generate flow stays exactly as it is (config returned to client only, no `quizzes` row written for anon).
2. **This sub-phase validates zero of the five claims.** It is plumbing. Keep the dashboard and editor deliberately thin. Do **not** linger or polish here — the first real validation (Claim 2 publish, Claim 3 lead) is the *next* push.
3. **Styling stays placeholder.** The STYLE.md design pass is a later, separate Phase 2 step. Build functionally first.

---

## Step 0 — Prerequisites (before any feature code)

- **Read the modified-Next docs.** `AGENTS.md` is a hard rule: this Next.js has breaking changes vs. training data, and auth touches the exact danger zones — middleware, cookies, route handlers, server components. Read the relevant guides in `node_modules/next/dist/docs/` first; do not write from memory. **(DONE — findings below.)**

### Next 16.2.7 findings (confirmed from `node_modules/next/dist/docs/`)
- **`middleware` is renamed to `proxy` (v16.0.0).** There is no `middleware` doc shipped at all — only `proxy`. The file is **`proxy.ts`** at project root (or `src/`), exporting `proxy` (or default). This is the breaking change that bites Supabase auth: the standard Supabase SSR quickstart says create `middleware.ts` to refresh the session cookie on every request — **in this project that file must be `proxy.ts`**. Cookie API is the same (`response.cookies.set(...)`), `NextResponse.next({ request: { headers } })` pattern unchanged.
- **Proxy defaults to the Node.js runtime** (the `runtime` segment config is not allowed in proxy and throws). Good — `@supabase/ssr` runs fine on Node; no Edge constraint.
- **Do NOT rely on proxy alone for auth.** The docs are explicit: a matcher change or moving a Server Function can silently drop proxy coverage. Verify auth at the data layer (Server Actions / Route Handlers / a DAL), with RLS as the real enforcement. Use proxy only for (a) refreshing the Supabase session cookie and (b) optimistic redirects.
- **`cookies()` from `next/headers` is async** — must be `await`ed (used in Server Components / Actions / Route Handlers for the Supabase server client).
- Codemod exists (`npx @next/codemod@canary middleware-to-proxy .`) but we author `proxy.ts` fresh, so it's not needed.
- **Read the Supabase SSR guide** and use `@supabase/ssr` for cookie-based sessions (install if absent).
- **Key strategy:** Sub-phase 2A needs only the **publishable/anon key** + `@supabase/ssr` cookie sessions. RLS enforces per-user access via `auth.uid()`; the user's own session writes their own rows. **The service-role key is NOT required for auth/persistence** — it becomes a prerequisite only for the *next* push (the public player writing `quiz_events`/`leads` as an unauthenticated visitor, bypassing RLS).

---

## Build order — Sub-phase 2A

### 1. Auth (Google OAuth + email magic link, no passwords)
- Supabase Auth, two methods only: Google OAuth and email magic link (`signInWithOtp`). No password auth.
- Wall placement = **value-first**: the trigger to authenticate is "save / keep going" on a generated quiz, not a gate on the landing page.

### 2. Profile creation in the auth callback
- On first login, create the `profiles` row **app-level in the callback** (not a DB trigger) — a trigger can't read the attribution cookie, and Claim 5 needs `signup_source` stamped at creation.
- **CRITICAL: set `profiles.id = auth.uid()` explicitly — do NOT use the table's `gen_random_uuid()` default.** RLS is `auth.uid() = id`, and `quizzes.owner_id` FKs to `profiles.id` under `auth.uid() = owner_id`. Letting the id default silently breaks both RLS and the quiz FK.
- Set `plan = 'trial'` (default) and compute `trial_ends_at = now() + 14 days` (`trial_started_at` already defaults to `now()`).

### 3. Quiz persistence (carry the quiz across the OAuth round-trip)
- After a quiz is generated and the user authenticates, write a `draft` `quizzes` row: `config` (validated JSONB), `source_url`/`business_context`, `title`, `owner_id = auth.uid()`, `status = 'draft'`.
- **Carry the generated quiz config across the OAuth redirect** — same round-trip problem as the attribution cookie. Stash the config (and the builder session id) before redirect; write the row on landing. Don't lose the magic-moment output to the auth bounce.

### 4. Minimal dashboard
- A list of the user's quizzes: title, status (draft/published), "continue editing." Nothing else — no stats, no analytics. Just enough to prove persistence and give a landing spot.

### 5. Editor persistence
- Edits persist back to the `quizzes` row via **explicit save / on-blur** (not realtime autosave — realtime adds debounce/optimistic/conflict handling that proves nothing extra here).
- After this, edits survive a refresh.

### 6. RLS verification + retire the Phase 1 anon policy
- RLS is already enabled with owner-scoped policies (`profiles_self`, `quizzes_owner`, `leads_owner`, etc.). **Explicitly test** that a user can touch only their own rows before moving on.
- **Retire `builder_events_anon_phase1`** once authed writes land (the migration comment mandates this). Decide: authed builder events now write with `owner_id` set; close the wide-open anon policy.

---

## Instrumentation (Claim 5 — must survive the OAuth round-trip)
- Before the OAuth redirect, stash `signup_source`, UTM params, and referrer in a **first-party cookie**; read them back in the callback to stamp the `profiles` row. This fails silently if not handled — it is the Claim 5 evidence.
- Where straightforward, backfill `builder_events.owner_id` for the claimed anon session on signup. Do not block auth on it.

---

## Sub-phase 2A gate (definition of done)
A user can: land → generate a quiz as anon → choose to save → authenticate (Google **and** magic link both work) → the just-generated quiz is persisted automatically → refresh the page and it's still there → see it listed in the dashboard → edit it and have the edit survive a refresh. RLS verified: no user can read or write another user's rows. `signup_source` is correctly stamped through the OAuth round-trip.

**Reminder: passing this gate validates none of the five business claims.** It is the foundation.

---

---

# Sub-phase 2B — Publish → Public Player → Lead Capture (the claim-validating push)

This completes the build-spec **Phase 2 gate** (§10): *"a pre-sale customer self-serves signup → publish → captures a test lead, and the create-to-publish funnel is readable."* It's the first work that tests real business claims: **Claim 2** (do they publish on their own?) and the capture half of **Claim 3** (does a lead get captured and become visible?).

## Scope boundary (what this push is and is NOT)
- **IN:** publish flow + the required publish-validation gate, slug, the public SSR player `/q/[slug]`, lead capture (write `leads` + `quiz_events`), captured-leads visible on-platform (dashboard count/list), and the remaining `builder_events` (`publish_attempted`, `publish_blocked_validation`, `published`).
- **OUT (deferred to the spec's Phase 3):** owner-notification email, WhatsApp click-to-chat, native email integrations (Kit/AC/etc.). Per §10 the lead is *captured and on-platform-visible* here; *delivery to the owner's channel* is Phase 3. (Owner-notify email can be folded in early if we add a Resend key — small addition; decide at start.)
- **OUT:** owner theming columns (accent/logo) — the player ships on a clean neutral ink-indigo base; theming is later polish. The full STYLE.md design pass is also separate.

## Step 0 — Prerequisites
- **Secret API key** (`sb_secret_…`) — the modern replacement for the legacy `service_role` key (legacy keys deprecate end of 2026; we're already on the publishable key for the client). Supabase → Settings → **API Keys** → Secret keys → reveal/create. REQUIRED: the public player and lead form act for an **unauthenticated visitor**, whose `quiz_events`/`leads` writes RLS blocks by design (§8). Add `SUPABASE_SECRET_KEY` to env — **server-only, never `NEXT_PUBLIC_`, never the browser** (it 401s client-side and bypasses RLS).
- **Wiring caveat (verified from docs):** the secret key bypasses RLS via the `service_role` Postgres role (`BYPASSRLS`) ONLY when no user session is attached — RLS keys off the `Authorization` header, not `apikey`. So build a SEPARATE `createSupabaseAdminClient()` using the secret key with `auth: { persistSession:false, autoRefreshToken:false }` and NO cookies. Do NOT reuse the cookie-bound `createSupabaseServerClient` (it carries the user session, which would override the bypass). Use the admin client ONLY for the anonymous visitor writes (`POST /api/leads`, `quiz_events`); everything authed stays on the cookie-bound client + RLS.
- New RLS/policy work: `quizzes` needs to be **publicly readable when `status='published'`** (the player SSRs without a session) — add a `select` policy for `published` rows, OR read via the service role in the player. Decide: a narrow public-read policy on published quizzes is cleanest (keeps the player on the anon key for reads; service role only for writes).

## Build order
### 1. Publish flow + validation gate
- "Publish" action on the editor/dashboard. On attempt, fire `publish_attempted`.
- **Validation gate (required, §5.4):** every outcome must have a non-empty, well-formed `cta.url`. If any is blank/invalid, BLOCK, show the inline prompt ("Add where this button should send people"), and fire `publish_blocked_validation` `{reason}`. The AI leaves CTA URLs empty by design, so this is the one thing the owner must supply.
- On success: generate a unique `slug`, set `status='published'`, `published_at=now()`, fire `published`. Show "Your quiz is live — here's your link" (hosted `/q/[slug]` first; embed iframe + copy-link are secondary, can be minimal).

### 2. Public player `/q/[slug]` (SSR, no auth, mobile-first)
- Server-rendered, **schema-driven**: select renderer by `config.schema_version` (only v1 today; structure so old quizzes never break).
- Flow: questions → lead capture (placement per `quizzes.lead_capture`, default email-gate before the outcome reveal) → outcome page with recommendations + CTA (the owner-supplied URL).
- **Does NOT wear the twilight aesthetic** (STYLE.md §6a): clean neutral ink-indigo, glass-pill controls, mobile-first. Free-tier **"Made with Funnelform"** watermark (linking back; `branding_enabled` default true).
- Fires `quiz_events`: `view`, `start`, `question_answered`, `completed`, `lead_captured` (anon `session_id` cookie).
- Scoring runs server-side/client per `match_logic` to pick the outcome.

### 3. Lead capture (`POST /api/leads`, no auth, service role)
- Form: **email (required) + phone (optional) + GDPR consent checkbox** (EU market, §8). Placement per config.
- On submit: write a `leads` row (`quiz_id`, denormalized `owner_id`, `email`, `phone`, `answers` `{qid: optionId}`, `outcome_id`) and a `quiz_events` `lead_captured` — both via the **service role** (visitor is unauthenticated).
- Validate input server-side; never trust the client.

### 4. Captured-leads visibility (on-platform, closes the gate)
- Dashboard: per-quiz lead count + a basic leads list (email, outcome, time) for the owner (RLS-scoped read). Enough to *see* the captured lead — full analytics/drop-off is the spec's Phase 3 §5.8.

## Instrumentation shipped with 2B (§9)
- `builder_events`: `publish_attempted`, `publish_blocked_validation` `{reason}`, `published` — these complete the **Claim 2** create-to-publish funnel (`generate_started → … → published`).
- `quiz_events`: the visitor funnel (view → start → question_answered → completed → lead_captured) — the per-quiz CRO + Claim 3 capture signal.

## Sub-phase 2B gate (definition of done)
A signed-in user can: open a saved quiz → **Publish** → be **blocked if any outcome CTA URL is blank** (with the inline prompt + `publish_blocked_validation` recorded) → fill the URLs → publish successfully (`published` recorded, slug minted) → open `/q/[slug]` on a phone as an anonymous visitor → answer the quiz → submit the lead form → and the owner sees that **lead captured** on-platform, with `quiz_events` (view→…→lead_captured) recorded. RLS verified: published quizzes are publicly readable; visitor writes go only through the service role; no visitor can read another owner's leads.

**This is the build-spec Phase 2 gate.** It validates Claim 2 (self-serve publish) and the capture half of Claim 3. Delivery to the owner's channel (email/WhatsApp/integrations) is the next push (spec Phase 3).
