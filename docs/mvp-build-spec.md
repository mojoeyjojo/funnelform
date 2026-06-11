# MVP Build Specification — AI Quiz Funnel Generator

**For:** Claude Code (IDE build)
**Stack:** Next.js 15 (App Router) + Supabase + Vercel + Stripe + Anthropic API
**Design language:** Inherit from `STYLE.md` (Odeun "luminous twilight" system — see Section 11)
**Build target:** Working MVP a solo founder can ship in 4-6 weeks
**Last updated:** June 9, 2026

---

## 0. How to Use This Document

This is the engineering source of truth. Build in the phase order given in Section 10 — the magic moment (URL → quiz) first, monetization last. Do not build features marked OUT OF SCOPE. When a design decision is ambiguous, defer to `STYLE.md`.

The product turns a website URL into a complete, publishable lead-generation quiz funnel in under 5 minutes. Core users are non-technical business owners (med spas, health/nutrition coaches, marketing agencies) in EU/LATAM and US markets.

---

## 1. System Architecture (High Level)

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 15 App (Vercel)                                     │
│                                                              │
│  /(marketing)   public landing + niche pages + free tool     │
│  /(app)         authed dashboard (create, edit, analytics)   │
│  /q/[slug]      public quiz player (SSR, no auth)            │
│  /api/*         route handlers (generate, leads, stripe hook)│
└───────────────┬──────────────────────────┬──────────────────┘
                │                          │
        ┌───────▼────────┐        ┌────────▼─────────┐
        │  Supabase      │        │  External APIs   │
        │  - Postgres    │        │  - Jina Reader   │
        │  - Auth        │        │  - Anthropic     │
        │  - Storage     │        │  - Stripe        │
        │  - RLS         │        │  - Resend        │
        └────────────────┘        └──────────────────┘
```

**Key principles:**
- Server Components by default; Client Components only for interactive editor + quiz player.
- All quiz data stored as structured JSONB in Postgres (one row per quiz).
- Row Level Security (RLS) on every table — users only access their own rows.
- The public quiz player (`/q/[slug]`) is server-rendered and must work with zero auth and load fast.
- AI generation runs server-side only (API keys never reach the client).

---

## 2. Tech Stack (Exact)

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 15, App Router, TypeScript | Server Components default |
| Hosting | Vercel | Free tier fine for MVP |
| DB / Auth / Storage | Supabase | Postgres + Auth (Google + email magic link) + RLS |
| Styling | Tailwind CSS | Tokens from STYLE.md |
| UI primitives | shadcn/ui | Restyle to match STYLE.md, do not ship default look |
| Fonts | Geist, Geist Mono | via the `geist` package |
| Payments | Stripe | Checkout + Customer Portal (don't build billing UI) |
| LLM | Anthropic Claude | Sonnet for generation, Haiku for cheap tasks |
| Scraping | Jina AI Reader | `https://r.jina.ai/{url}` → clean markdown, no key |
| Transactional email | Resend | Your emails only, not users' quiz follow-ups |
| Analytics | PostHog | Free tier; instrument activation funnel |
| Validation | Zod | All API input + AI output validation |

**Infra budget:** under $50/mo + Anthropic usage (scales with revenue).

---

## 3. Data Model (Postgres / Supabase)

All tables have `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz`. RLS on all.

### `profiles` (extends auth.users)
```
id              uuid pk (= auth.users.id)
email           text
full_name       text
business_name   text
plan            text default 'trial'      -- trial | free | pro | growth
trial_started_at timestamptz default now()
trial_ends_at   timestamptz               -- trial_started_at + 14 days
stripe_customer_id text
locale          text default 'en'         -- en | es | pt
signup_source   text                      -- free_tool | comparison | niche_page | founder | direct | other
founder_assisted boolean default false    -- TRUE if we helped this account (DMs, manual setup); excluded from activation metrics
```

### `quizzes`
> **Anon note:** `owner_id` is NOT NULL. Anonymously-generated quizzes from the free tool do NOT live here — they are held client-side in `localStorage` until signup, then written as the user's first row via `/api/quiz/claim` (see Section 5.10). No nullable-owner anon store exists.
```
id              uuid pk
owner_id        uuid fk -> profiles.id
slug            text unique               -- used in /q/[slug]
status          text default 'draft'      -- draft | published
title           text
source_url      text                      -- the URL it was generated from
business_context text                     -- scraped/typed business description
config          jsonb                     -- full quiz structure (see 3a)
branding_enabled boolean default true     -- watermark on/off (free tier forced true)
lead_capture    jsonb                     -- {placement, headline, sub, button, fields[]}
delivery        jsonb                     -- {email_integration, whatsapp_number, notify_email}
published_at    timestamptz
```

### `quiz_config` JSONB shape (3a)

**This is the single most important contract in the build.** The LLM generates *content*; this schema fixes the *structure*. The renderer only ever handles this one shape. The AI fills slots — it never designs the form. Every generated quiz MUST validate against this schema (Zod) before it is stored or rendered (see Section 4, step 5).

**Versioning is mandatory.** The top-level `schema_version` field is required so that when the structure changes later, already-published quizzes still render. The player selects a renderer by `schema_version`; never break old quizzes with a schema change.

```json
{
  "schema_version": 1,
  "type": "scored | personality | recommendation",
  "questions": [
    {
      "id": "q1",
      "text": "When you look in the mirror, what catches your eye?",
      "options": [
        { "id": "q1a", "label": "Fine lines", "tags": ["botox"], "score": {"botox": 2} }
      ]
    }
  ],
  "outcomes": [
    {
      "id": "out1",
      "name": "The Glow Getter",
      "match_logic": { "primary_tag": "botox", "min_score": 4 },
      "description": "...",
      "recommendations": ["Botox", "SkinVive"],
      "cta": { "label": "Book My Consultation", "url": "" }
    }
  ],
  "email_sequence": [
    { "send_offset_hours": 0, "subject": "...", "body": "...", "cta": "..." }
  ]
}
```

### `leads`
```
id              uuid pk
quiz_id         uuid fk -> quizzes.id
owner_id        uuid fk -> profiles.id     -- denormalized for RLS + queries
email           text
phone           text
answers         jsonb                      -- {q1: "q1a", q2: "q2c", ...}
outcome_id      text                       -- which outcome they landed on
created_at      timestamptz
```

### `quiz_events` (visitor journey — the published quiz's audience)
```
id              uuid pk
quiz_id         uuid fk
event_type      text                       -- view | start | question_answered | completed | lead_captured
question_id     text                       -- nullable
session_id      text                       -- anon cookie
created_at      timestamptz
```

### `builder_events` (owner journey — create-to-publish, the Claim 1 & 2 instrument)
```
id              uuid pk
owner_id        uuid fk -> profiles.id
quiz_id         uuid fk                    -- nullable until quiz row exists
event_type      text                       -- see list below
metadata        jsonb                      -- counts, field ids, ratings
created_at      timestamptz
```
**`builder_events.event_type` values (track the owner's own funnel):**
`generate_started` · `generate_succeeded` · `generate_failed` · `thin_site_fallback_shown` · `first_output_viewed` · `output_rating` (metadata: `{rating: "love_it" | "not_quite"}`) · `field_edited` (metadata: `{field_path}`) · `question_regenerated` · `outcome_regenerated` · `publish_attempted` · `publish_blocked_validation` (metadata: `{reason}`) · `published`

This table is what lets us separate Claim 1 (is the AI good?) from Claim 2 (is it zero-touch?). Publish rate alone cannot. See Section 9.

### `integrations`
```
id              uuid pk
owner_id        uuid fk
provider        text                       -- kit | activecampaign | mailchimp | kajabi | hubspot
access_token    text (encrypted)
config          jsonb                      -- list id, tag mapping, etc.
```

---

## 4. The AI Generation Pipeline (The Core)

This is the magic moment. Build it first and make it excellent.

**Flow:**
1. User submits URL (or one-line description).
2. Server calls Jina Reader: `GET https://r.jina.ai/{encodedUrl}` → clean markdown.
3. If markdown < ~150 words (thin/blocked site) → return a fallback flag; client shows a 3-field "tell us about your business" form. Feed those answers in place of scraped content.
4. Server sends business context to Claude with the generation system prompt (see 4a).
5. Claude returns structured JSON matching the `quiz_config` schema (Section 3a), including `schema_version`. **Validate with Zod against the strict, versioned schema.** On parse/validation failure, retry once with a stricter "return ONLY valid JSON matching this schema" reminder. Never store or render unvalidated output — the renderer depends on the structure being guaranteed.
6. Persist as a `draft` quiz, return to client, render in editor.

**Target: under 30 seconds end to end.** Stream nothing to the user except a progress state ("Reading your site… Writing your quiz… Building your results…").

### 4a. Generation prompt (system) — starting point
Use a structured prompt that instructs Claude to: analyze the business, identify ideal customer + core transformation + brand tone, then output ONLY valid JSON matching the schema. Key requirements baked into the prompt:
- 5-7 questions, easy→qualifying progression, conversational tone, mirrors brand voice.
- 3-4 identity-driven outcome names (not "Type A").
- Outcomes reference the business's ACTUAL services (pulled from scrape).
- Scoring/tags fully wired in the JSON (user never sees raw logic).
- A 3-email follow-up sequence personalized by outcome.
- NEVER include meta-commentary, platform suggestions, or text outside the JSON object. (This kills the "build this in Typeform/Interact" trailing line observed in testing.)

Model: `claude-sonnet` for generation. Use `claude-haiku` for cheap operations (regenerating a single question, tone tweaks).

**Cost control:** free tier = 1 generation + limited regenerations. Rate-limit by IP + account. Cap output tokens.

---

## 5. Feature Spec — IN SCOPE (MVP)

### 5.1 Auth & onboarding
- Supabase Auth: Google OAuth + email magic link. No password.
- No credit card at signup. On first login, create `profile` with `plan='trial'`, `trial_ends_at = now()+14d`.
- Capture `signup_source` from the entry path (free tool / comparison / niche page / founder / direct) — needed for Claim 5 attribution.
- Post-signup → straight into the generation flow (paste URL). No empty dashboard.
- **WhatsApp delivery setup is a prominent, single step in the publish flow (NOT buried in settings).** For locale `es`/`pt` users especially, surface "Where should we send your leads?" with WhatsApp number entry as a first-class option alongside email. This one field is the Claim 3 wedge — make it obvious and frictionless.

### 5.2 Generate flow
- Single input: URL or one-line description, with a clear example placeholder.
- Progress states during generation.
- Thin-site fallback form (3 fields: what you do, who you serve, main offer).
- **One-tap quality signal that fires on `first_output_viewed`, BEFORE any editing: "Love it" / "Not quite."** Timing is critical — if the prompt appears after the user has started editing, the signal is contaminated by their own changes and no longer reads raw AI quality. Present it on the first view of the generated quiz, before the editor is interacted with. Fires `output_rating` to `builder_events`. This measures Claim 1 DIRECTLY instead of inferring it from publish rate. Non-blocking — the user can rate and continue either way.

### 5.3 Quiz editor

**Two distinct edit modes — both shipped:**

1. **Direct manual editing (no prompting required).** The user clicks into any text field and types. Covers: title, question text, answer option labels, outcome names + descriptions, recommendations, CTA labels/URLs, and lead-capture copy. This is for precision edits (fix a typo, reword a question) — the user must NOT have to prompt the AI for small changes.
2. **AI regeneration (prompt-based).** A "regenerate" button on any single question or single outcome makes a cheap Haiku call and swaps in a fresh version. This is for "I don't like this, give me another take" — not for fine edits.

**Email sequence is DISPLAY-ONLY in the MVP (resolved scope decision).** The AI still generates the 3-email follow-up sequence because it adds to the "it did everything for me" wow that supports Claim 1. But the MVP has NO email-sending path for users' quiz follow-ups (Resend is for our own transactional email only). Therefore: show the generated sequence read-only as a preview ("Here's a follow-up sequence we drafted — copy it into your email tool"), with a copy-to-clipboard button. Do NOT build editable fields, regeneration, or scheduling around it. Sending the sequence natively is a post-MVP feature. This removes editor complexity that currently sends nowhere.

**Locked: scoring/branching logic is NOT user-editable.** Users edit words, never the mapping of answers → outcomes. The AI owns `tags`, `score`, and `match_logic`. When a user edits or regenerates an option/outcome, the underlying logic mapping is preserved (regeneration rewrites copy and may re-tag, but the user never hand-wires logic). This is the constraint that keeps the product zero-touch and shippable — a visual logic builder would turn this into Outgrow and kill the wedge.

- Limited theming: pick from a small set of color themes + the business logo/accent. (Full custom theming OUT.)
- Live preview pane (renders the actual quiz player inline, so what they edit is what publishes).

### 5.4 Publish & distribution (THREE methods)

On publish, generate a unique `slug`. The quiz is then usable three ways:

1. **Hosted page (the hero / default).** Lives at `/q/[slug]` on your domain. Requires zero technical skill and no website — the owner can use it immediately (Instagram bio, WhatsApp, email). This is the celebrated default in the publish flow because earlier research showed embedding is exactly where non-technical users get stuck.
2. **Embed snippet (secondary, "want it on your own site?").** Presented as an optional upgrade after the hosted link. **Implementation: the embed is an `<iframe>` pointing at the hosted `/q/[slug]` page — NOT injected DOM/markup.** An iframe is bulletproof across page builders, isolates your styling from the host theme, and avoids a mountain of Wix/Squarespace support tickets. Must render cleanly on WordPress, Webflow, Squarespace, Wix.
3. **Copy link for WhatsApp/social.** The hosted-page URL framed as a shareable link. Ties into the WhatsApp wedge — the player is mobile-first specifically so it works when shared into a chat.

Publish flow priority: show the hosted link first ("Your quiz is live — here's your link"), then offer the embed snippet as the secondary option.

**Publish validation (required gate).** Before a quiz can move to `published`, validate that every outcome has a non-empty CTA URL (and that URLs are well-formed). A quiz with blank CTA URLs is a broken funnel that corrupts both Claim 1 (looks like bad AI output) and Claim 3 (leads go nowhere). Block publish with a clear inline prompt ("Add where this button should send people") and fire `publish_blocked_validation` with the reason. The AI leaves CTA URLs empty by design (it can't know the booking link), so this is the one thing the user MUST supply.

### 5.5 Quiz player (`/q/[slug]`)
- Server-rendered, fast, mobile-first (most traffic is mobile, especially LATAM and WhatsApp-shared).
- **Renderer is schema-driven:** selects rendering logic by `config.schema_version` so old quizzes never break when the schema evolves.
- Renders questions → lead capture (placement per config) → outcome page with recommendations + CTA.
- Fires `quiz_events` (view, start, question_answered, completed, lead_captured).
- Free-tier quizzes show "Made with [App]" watermark linking back to your site (the distribution/viral mechanic — on for free, off for paid).

### 5.6 Lead capture + delivery
- Lead form: email (required) + phone (optional). Placement (before/after results) per config.
- On submit: write `lead` row, then deliver via configured channels:
  - **Email integration (native):** push to Kit / ActiveCampaign / Mailchimp / Kajabi / HubSpot with outcome as a tag/field.
  - **WhatsApp delivery (NO API):** (a) results page shows a "Continue on WhatsApp" CTA = `wa.me` click-to-chat to the BUSINESS number, prefilled with their outcome; (b) owner notification when a lead completes — via email always, plus optional Twilio WhatsApp/SMS ping to owner (later sub-phase).
  - **Fallback:** Zapier webhook + raw webhook + Google Sheets export.

### 5.7 Native integrations (build in this order)
1. Kit (ConvertKit) — coach/creator default
2. ActiveCampaign
3. Mailchimp
4. Kajabi
5. HubSpot
- OAuth or API-key per provider; store encrypted; map outcome → tag/list.
- **Build only the FIRST integration your pre-sale customers actually use; ship the rest post-launch.**

### 5.8 Analytics dashboard (basic)
- Per quiz: views, starts, completion rate, drop-off by question, leads captured, outcome distribution.
- This is also your CRO playground — make the drop-off-by-question view clear.

### 5.9 Pricing / paywall (Stripe)
- Reverse trial: 14 days full Pro → then `free` floor.
- **Build TWO tiers, show THREE.** Only Free + Pro are built and enforced for the MVP — they are all that's needed to prove Claim 4 (people pay). The Growth tier appears on the pricing page for positioning (agencies need to see a tier exists) but is "Contact us" / waitlist at launch, with NO multi-workspace / white-label / A/B enforcement built. This removes paywall and Stripe config that tests none of the five claims.
  - **Free:** 1 active quiz, watermark forced on, ~50-100 leads/mo, basic export.
  - **Pro $39/mo or $390/yr:** unlimited quizzes, watermark off, all integrations + WhatsApp, drop-off analytics, ~1,000 leads/mo soft cap.
  - **Growth $89/mo (shown, not built):** multi-workspace, white-label, A/B — "Contact us" at launch.
- Paywall triggers in order: 2nd active quiz → branding removal → analytics/integrations → lead soft cap.
- Use Stripe Checkout + Customer Portal. Webhook updates `profile.plan`. Default first upgrade to MONTHLY.
- Lead counts tracked for DISPLAY, never a hard lock mid-campaign.

### 5.10 Free tool — `/tools/ai-quiz-generator` (load-bearing: #1 acquisition engine + Claim 5 instrument)

This is the single most important acquisition surface and the main test of Claim 5, so its mechanics are specified explicitly rather than left implicit. It is the magic moment, ungated, with a conversion handoff.

**Anonymous generation flow (no DB row, no anon writes):**
- Visitor lands (no account), pastes a URL or one-line description.
- Request goes to a dedicated anonymous endpoint `POST /api/generate/anon` (a server action using the **service role**, never a client/authed insert — RLS blocks anon writes by design, so anon generation must NOT touch user tables).
- The generated config is **returned to the client and held in `localStorage`** — there is NO `quizzes` row yet. The tool renders it read-only as the preview/demo. This keeps `quizzes.owner_id` non-null (see Section 3) and keeps RLS clean (zero anonymous writes).

**Abuse / cost cap (anonymous, keyless, public AI endpoint = real cost + abuse surface):**
- **1 generation per IP per rolling 24h**, enforced server-side on `/api/generate/anon` (not client-side).
- Lightweight bot challenge (Turnstile/hCaptcha) before the generation call.
- **No anonymous regenerations** — regeneration is an authed-only feature. A second attempt prompts signup ("Create a free account to generate more").
- Cap output tokens; separate rate-limit bucket from the authed `/api/generate`.

**Quiz-to-account handoff (THE conversion mechanic — must not lose the quiz):**
- The anon config lives in `localStorage`. When the visitor signs up to edit/publish/save, the client posts that stored config to `POST /api/quiz/claim`, which writes the FIRST `quizzes` row owned by the newly-created user (a single authed write at the moment of auth).
- The user lands in the editor with their quiz intact. **Never make the user regenerate after signup** — losing the quiz at the signup wall would recreate the exact blank-page problem this product exists to kill.
- The claim write is also where you stamp `signup_source=free_tool` (read from the pre-redirect cookie that survives OAuth — see Section 9).
- Trade-off accepted: this depends on `localStorage`. Acceptable for a one-shot funnel; if it's cleared before signup, the user simply regenerates (cost-capped). No server-side anon persistence needed.

**Instrumentation:** anonymous `generate_succeeded`, `output_rating` (fires anonymously too — extra clean Claim 1 data), free-tool → signup conversion, `signup_source` attribution stamped at claim.

**Build-time notes (edges the localStorage decision raises — handle in code, not spec):**
- **Keep anon ratings on a SEPARATE line from owner ratings.** Anon raters are a different population (curious tire-kickers, fewer real businesses pasting real URLs). Clean signal, but not the same signal. Do not pool anon `output_rating` into the headline owner Claim 1 metric or it drifts toward tourist sentiment.
- **Claim-miss must not strand the user.** If someone generates anonymously, signs up, but the localStorage payload is gone on return (different browser, privacy mode, cleared between tabs), `/api/quiz/claim` has nothing to write. The user then regenerates — but that is now an authed call against the 1-quiz free limit. Ensure the claim-miss path does NOT land them on "you've used your free quiz" with nothing claimed. A fresh signup with no claimed quiz must always be allowed at least one authed generation.
- **The second-anon-attempt path is a conversion moment, not just a rate-limit wall.** When the IP cap (1/24h) blocks a second anon generation, the message must cleanly route to "create a free account to keep going," not a dead end. Expect some shared/NAT'd-IP false positives (offices, LATAM mobile carriers especially — your wedge market); the bot challenge + signup prompt is the relief valve. Don't loosen the cap preemptively.

---

## 6. OUT OF SCOPE (Do NOT build for MVP)
- Visual branching/logic builder (AI generates logic; users edit copy only)
- Full custom theming / custom fonts / custom domains
- A/B testing (Growth tier, later — shown on pricing page, not built)
- Multi-language quiz generation (UI localization yes; multilingual quiz output later)
- Video/audio questions
- WhatsApp Business API outbound sequences (use no-API click-to-chat only)
- Native email SENDING of the generated follow-up sequence (display-only + copy-to-clipboard in MVP)
- Native med-spa clinical CRMs (Jane, Mindbody, Pabau) — Zapier only
- Growth-tier enforcement: multi-workspace, white-label, A/B (shown on pricing for positioning, not built)
- Mobile app

---

## 7. Routing Map

```
(marketing)
  /                          landing (hero = paste-URL demo)
  /med-spas                  niche landing
  /coaches                   niche landing (health/nutrition)
  /agencies                  niche landing (white-label angle)
  /tools/ai-quiz-generator   FREE ungated tool (top of funnel; ships Phase 2.5, see 5.10)
  /vs/outgrow                comparison/BOFU
  /vs/typeform               comparison/BOFU
  /vs/scoreapp               comparison/BOFU
  /vs/interact               comparison/BOFU
  /pricing

(app)  [auth required]
  /app                       dashboard (quiz list)
  /app/new                   generate flow
  /app/quiz/[id]             editor
  /app/quiz/[id]/analytics   analytics
  /app/settings              profile, integrations, billing (Stripe portal link)

public
  /q/[slug]                  quiz player (SSR, no auth)

api
  /api/generate              URL -> quiz (Jina + Claude)        [auth]
  /api/generate/anon         free-tool generation               [no auth, service role, IP-capped, bot-checked, no regen]
  /api/quiz/claim            write localStorage anon quiz as user's first row + stamp signup_source  [auth]
  /api/regenerate            single question/outcome (Haiku)     [auth only]
  /api/leads                 lead capture + delivery
  /api/stripe/webhook        plan sync
  /api/integrations/[provider]/callback
```

---

## 8. Security & Privacy
- RLS on every table; users access only `owner_id = auth.uid()` rows.
- AI/API keys server-side only (route handlers / server actions).
- Integration tokens encrypted at rest.
- Lead data is the user's asset — easy export, clear deletion.
- GDPR-aware (EU market): consent checkbox on lead forms, privacy copy, data deletion endpoint.
- Validate + sanitize all AI output before render (no raw HTML injection from model).
- Rate-limit `/api/generate` (IP + account) to control AI cost and abuse.
- **Anonymous free-tool endpoint (`/api/generate/anon`):** no auth, runs via service role, must NOT write to user tables (RLS blocks anon writes by design — respect that, don't bypass it for persistence). Defenses: 1 generation per IP per 24h, bot challenge, no regenerations, separate rate-limit bucket, capped output tokens. The generated config returns to the client and lives in `localStorage` only until the user signs up and `/api/quiz/claim` writes it as their first owned row.

---

## 9. Instrumentation — Read Each Claim Off a Dashboard (FIRST-CLASS, build per phase)

Instrumentation is a feature, not an afterthought. The MVP exists to validate five claims; if we ship without these, we cannot tell which passed or failed. Each event below ships in the same phase as the feature it measures. **All activation/quality metrics must exclude `founder_assisted = true` accounts** or the numbers are dishonest.

**Claim 1 — AI output is good enough to publish.**
- Primary (direct): `output_rating` love_it vs not_quite ratio. Target: ≥70% "love it."
- Corroborating (behavioral): edit intensity before publish — count of `field_edited` + `question_regenerated` + `outcome_regenerated` per quiz. **Low edits + high publish = AI is genuinely good. High edits + high publish = AI is NOT good enough; we just have motivated users.** This pairing is the whole point — publish rate alone cannot separate Claim 1 from Claim 2.

**Claim 2 — Zero-touch onboarding works.**
- Headline: signup → `published` rate, excluding founder-assisted accounts. Target: >50%.
- Failure-location funnel (so a low rate is fixable): `generate_started → generate_succeeded → first_output_viewed → publish_attempted → published`, plus `generate_failed`, `thin_site_fallback_shown`, `publish_blocked_validation`. Tells us exactly where people drop: generation, first sight of output, mid-edit, or the publish gate.

**Claim 3 — Lead capture & delivery loop closes.**
- **The real proof is the owner-notification email firing on every `lead_captured`.** This is what actually closes the loop and is fully observable on-platform. For native email integrations, also track push-success. Native email-integration push success is corroborating proof.
- **WhatsApp is a wedge metric, NOT a delivery-success metric.** Click-to-chat happens off-platform, so "WhatsApp CTA configured / clicked" is adoption evidence, not proof a lead reached the owner. Measure: % of `es`/`pt` (and overall EU/LATAM) signups who set a WhatsApp number and publish with WhatsApp delivery on (target ≥25-30%). Do not claim delivery success from a click-to-chat event. The owner-notify email does the actual Claim 3 validation work; WhatsApp opt-in measures wedge adoption.

**Claim 4 — People pay.**
- trial → paid (target 4-6%), free → paid (target 3-5%), and which paywall trigger fired at upgrade (2nd quiz / branding / analytics).

**Claim 5 — Organic acquisition works.**
- `signup_source` attribution on every signup. Free-tool → signup conversion specifically. Per-channel signup→activation→paid. Tells us which channel (free tool vs comparison vs niche vs founder) actually produces qualified users.

**Visitor-side (per published quiz, also the CRO playground):** completion rate, drop-off by question, outcome distribution.

**Where the claims are read (decide once, don't instrument twice):** PostHog is the founder's claim dashboard. `builder_events` and the five-claim funnel are sent to PostHog (Supabase stays the system of record; mirror the events on write). The in-app analytics dashboard (Section 5.8) queries `quiz_events` from Supabase directly for the owner's CRO view. Rule of thumb: founder/claim analytics → PostHog; owner-facing per-quiz analytics → Supabase query. Do not rebuild the same funnel in both.

**Attribution must survive OAuth (silent-failure warning).** `signup_source`, UTM, and referrer are dropped during the Google OAuth round-trip. Stash them in a first-party cookie BEFORE the redirect and read them back on return to set `signup_source`. Claim 5 fails silently if this isn't handled — and a silently-broken metric is the worst outcome in an experiment whose only job is measurement. Verify attribution end-to-end before launch.

---

## 10. Build Order (Phases)

Instrumentation ships *with* each phase (see Section 9), never bolted on at the end.

**Phase 1 — Magic moment (Week 1).** Next.js + Supabase + Vercel skeleton. `/api/generate` (Jina + Claude + Zod, versioned schema). Bare UI: paste URL → see generated quiz rendered. The one-tap `output_rating` and `builder_events` for the generate flow. No auth, no styling polish. **Gate: works end to end in <30s AND we can see love-it/not-quite + edit counts.**

**Phase 2 — Real product (Week 2).** Auth (Google + magic link) with `signup_source` capture. Editor (text edits + regenerate; email sequence display-only). Quiz player `/q/[slug]` SSR. Lead capture + `leads` + `quiz_events` + remaining `builder_events`. Publish validation (CTA URLs required). Apply STYLE.md. **Gate: a pre-sale customer self-serves signup → publish → captures a test lead, and the create-to-publish funnel is readable.**

**Phase 2.5 — Free tool early (ships the moment `/api/generate` is stable, overlapping Week 1-2 — NOT Week 4).** Ship a thin `/tools/ai-quiz-generator`: the magic moment, ungated, with the quiz-to-account handoff. It is essentially Phase 1's pipeline with no auth wrapped around it, so it can ship almost immediately. Rationale: it's the #1 acquisition engine and Claim 5's main instrument; organic takes months to mature, so SEO age and Claim 5 data must start accumulating NOW. Full mechanics — anon generation via service role, IP cap, and the localStorage-to-account claim handoff — in Section 5.10. **Gate: free tool live and indexed, anonymous generation capped (1/IP/24h, no regen), localStorage→claim handoff works, `signup_source=free_tool` tracking verified through OAuth.**

**Phase 3 — Delivery + first integration (Week 3).** WhatsApp no-API delivery (click-to-chat + owner email notify), with WhatsApp number entry prominent in publish flow. ONE native integration (the one your pre-sale users use). Zapier/webhook/Sheets fallback. Analytics dashboard (drop-off by question). **Gate: a real lead flows to the owner's channel; WhatsApp opt-in rate visible.**

**Phase 4 — Monetize + launch (Week 4).** Stripe Checkout + Customer Portal + webhook plan sync. Reverse-trial state machine + paywall triggers. Two tiers built (Free + Pro), three shown. Landing page + 3 niche pages + 2 comparison pages (free tool already live since Phase 2.5). Onboard paying pre-sale customers (flag them `founder_assisted` if you helped). **Gate: first paid subscription processed.**

**Phase 5 — Expand (Weeks 5-6).** Remaining integrations (demand-driven). More comparison/niche pages. ES/PT localization of top pages. Full claim dashboard review against targets. Product Hunt + Indie Hackers launch.

---

## 11. Design System — Inherit from STYLE.md

Use the uploaded `STYLE.md` (Odeun "luminous twilight") as the visual source of truth. Direct mappings for this product:

- **Marketing/landing pages:** full twilight aesthetic — gradient "sky" sections, glass pills, heavy Geist headings (weight and size for emphasis, no serif accent), indigo-tinted shadows, atmospheric motion (respect `prefers-reduced-motion`).
- **App dashboard:** lighter touch — keep ink-indigo structure, glass surfaces, pill buttons, `signal-600` for primary actions. Prioritize clarity over atmosphere; less motion.
- **Quiz player (`/q/[slug]`):** must adopt the BUSINESS's accent color + logo, not your brand. Default to a clean, glass-pill, ink-indigo neutral that the owner can lightly theme. The watermark "Made with [App]" uses your signal-600 wordmark.
- **Tokens to reuse verbatim:** ink scale (`#0a0f2e`→`#f3f4ff`), `signal-600 #3834ff` as the single action color, `radius-pill 999px` for buttons/inputs/badges, `radius-card 22px` for media/large surfaces, glass utilities with the inset top-highlight, `shadow-soft`/`shadow-float`.
- **Type:** Geist (all UI/body/headings), Geist Mono (numeric/stat labels). No serif, no italic accent — hierarchy by weight and size. Hero H1 800 weight, `-0.04em`, `0.98` leading.
- **Voice:** warm, second-person, founder-intimate (per STYLE.md §6). Microcopy examples: "Paste your link. Watch the funnel build itself." / "Your quiz is live." / "First lead just landed."

Keep `STYLE.md` in the repo root and have Claude Code read it before building any UI.

---

## 12. First Things to Scaffold (today)
1. `npx create-next-app` (TS, App Router, Tailwind).
2. Add `STYLE.md` to repo root; configure Tailwind tokens + next/font from it.
3. New Supabase project; create tables + RLS from Section 3.
4. Env: `ANTHROPIC_API_KEY`, Supabase keys, `STRIPE_*`, `RESEND_API_KEY`.
5. Build `/api/generate` against the prompt in Section 4a. Get URL → quiz JSON working before any UI polish.
