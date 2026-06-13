# Design Pass v2 — Reconciled Stage Brief (Phase 2, final item)

> **Status: SPECCED 2026-06-13, not yet built.** This document reconciles the externally-written "Stage Brief — Design Pass" (market-research follow-up) against the actual state of the codebase. The external brief was written without project context and assumed a pre-design-round-1 skeleton. Roughly half of it is already shipped and verified. This doc is the source of truth for what remains; where it disagrees with the external brief, THIS doc wins.

---

## 1. Audit — external brief vs reality

| Brief item | Verdict | Evidence |
| --- | --- | --- |
| A1 routing: `/` becomes marketing, generate moves to `/app/new` (authed) | **AMENDED, partially rejected** (see §2.1) | `/` is already a styled landing whose hero IS the live generator (`src/components/Generator.tsx`, HeroSky + glass URL pill) |
| A2 design tokens: "globals.css currently has almost nothing" | **STALE: already done** (design round 1) | `src/app/globals.css` has the full ink scale, signal, twilight, glass utilities with inset top highlight, indigo shadows, radii, motion + `prefers-reduced-motion`; Geist + Geist Mono via `geist/font` in `src/app/layout.tsx` |
| A3 surface treatments (marketing full wash / app lighter / player neutral) | **Done except owner theming** | `/` wears the sky hero; dashboard, pricing, editor, analytics wear the lighter app treatment; player is neutral ink with only the watermark carrying our brand |
| B1 one question per screen | **Already done** | `QuizPlayer.tsx` renders exactly one `QuestionStep` per view, tap advances |
| B2 question order sacred, capture last | **Already done** | Player renders `config.questions` in order; lead capture at configured placement (`before_results` default), never earlier; editor never reorders |
| B3 lead form 2 fields max | **Already done** | `LeadForm` hardcodes email (required) + phone (optional). The GDPR consent checkbox stays: it is a legal requirement (spec §8, EU market), not a qualification field, and it does not count against the ceiling. Enforcement is by construction: the player ignores `lead_capture.fields[]` and can never render more |
| B4 progress: step count, not a crawling bar | **PARTIAL, needs change** (see §2.3) | Mono "Question 3 of 6" exists, but a progress bar sits ABOVE it as the visually primary element, and it fills as `index/total` so question 1 shows 0% (the exact backfire pattern the research warns about) |
| B5 mobile-first player | **Done, verify on a phone** | `max-w-xl`, full-width tappable option cards, no hover-dependent affordances, SSR page + lean client player |
| B6 welcome screen with effort cost | **GAP, build it** (see §2.2) | No welcome screen exists; the player drops visitors straight onto question 1 |
| Done-criterion 4: player themed by owner accent + logo | **GAP, scope split** (see §2.4) | No theming columns exist anywhere (checked migrations 0001-0004 and `schema.ts`). The brief claims "no backend work / no schema changes" yet this criterion requires both. Accent ships now (tiny migration), logo defers |
| Part C non-goals (booking, branching, enrichment, conversational AI, voice, calculators) | **Confirmed: none built** | n/a |

Also stale in the brief: "Marketing landing page (does not exist yet)" is half wrong (the hero exists and is live; the page body below it does not), and `/mockups` does not exist in this repo. STYLE.md is the only visual source of truth.

---

## 2. Decisions (these override the external brief)

### 2.1 Routing: generation stays in the `/` hero. No `/app/*` migration.

The brief wants `/` marketing-only with generation moved behind auth at `/app/new`. Rejected, for three reasons:

1. **It contradicts the product's own spec and live funnel.** The build-spec routing map itself defines `/` as "landing (hero = paste-URL demo)". The mandatory-signup funnel is LIVE and instrumented on `/`: anon visitor generates (1/day), sees the magic, hits the AuthOverlay, signs up, the build replays via `ff_pending_prompt`. Moving generation behind auth kills the value-first magic moment that Claim 2 rests on.
2. **The hero hand-off the brief proposes adds a navigation step** between paste and generate, which is pure friction at the single most important moment in the product.
3. **The `/app/*` prefix move for owner surfaces is URL churn with no user value** and real breakage risk: auth callback redirects, `login?next=` params, Stripe checkout success URL (`/dashboard?upgraded=1`), lead-notification deep links, and the trial-reminder email's manage URL all point at current paths.

**What we do instead:** `/` stays the generator-hero and GROWS DOWNWARD into the full marketing page. New sections below the hero (idle state only): how it works (3 steps), what you get (questions, scored outcomes, follow-up email sequence), a real player screenshot or live demo quiz link, pricing teaser linking `/pricing`, short FAQ, footer (privacy, contact). Full twilight treatment per STYLE.md. Owner routes stay at `/dashboard`, `/edit/[id]`, `/analytics/[id]`, `/leads/[id]`, `/pricing`. The spec §7 routing map is annotated accordingly.

### 2.2 Welcome screen (B6) — the one real player gap

Add a start screen to `QuizPlayer` before question 1:

- Quiz title (already in the header today), plus a designed effort-cost line in Geist Mono: `6 questions · about 60 seconds`.
- Time estimate formula: `questions × 10s`, displayed as "about N seconds" up to 90s, otherwise "about N minutes" (rounded). No config field needed; computed at render.
- One full-width Start button (accent-colored once 2.4 ships; ink-950 until then).
- **Event semantics change:** `start` fires on the Start tap, not on the first answer. `view` stays on mount. This makes `view → start` a true intent signal and makes drop-off-by-question denominator cleaner. Note for analytics reading: completion rate (completed/starts) will read HIGHER after this ships because starts become deliberate; do not compare across the boundary.
- Research backing: showing the total step count and a concrete effort number on the first screen lifts completion; the welcome screen is also where the "three minute rule" ceiling is communicated. Sources in §5.

### 2.3 Progress indication (B4) — demote the bar

- The mono step count (`Question 3 of 6`) becomes the FIRST element, visually primary.
- The bar shrinks to a hairline (h-1) BELOW the label, secondary, and fills as `(index + 1) / total` so question 1 shows 1/6 progress, never 0%. (Keeping a subtle bar beats removing it: research favors pairing position + visual momentum, but the count must lead.)

### 2.4 Player owner-theming — accent now, logo later

The brief's done-criterion 4 (owner accent color + logo) contradicts its own "no schema changes" rule. Split it:

- **Ship now: accent color.** Migration 0005 adds `quizzes.theme_accent text` (nullable; null = neutral ink default). Editor gets a simple color input ("Brand color") in the quiz settings area. Player applies it as a CSS variable to: progress fill, selected answer border/tint, Start button, lead-form submit, outcome CTA. Contrast guard: if the chosen color fails contrast on white for button text, render button text in ink-950 instead of white (simple relative-luminance check, no library).
- **Defer: logo upload.** Needs Supabase Storage, file validation, sizing rules, and an abuse surface. Post-launch. A quiz with a good accent color already reads as the business's surface; the watermark stays the only Funnelform brand element on free tier.

### 2.5 Out of this stage (confirming Part C, plus)

Everything in the brief's Part C, and additionally: niche pages (`/med-spas` etc.), `/vs/*` comparison pages (spec Phase 4/5), logo upload (2.4), the `/app/*` prefix migration (2.1), and any `lead_capture.fields[]` configurability (the 2-field ceiling is enforced by construction; keep it that way).

---

## 3. Work list (ordered, prospect-facing first)

1. **Marketing body on `/`** (the real net-new build): sections per 2.1, full twilight treatment, scroll reveals per STYLE.md §7, all motion behind `prefers-reduced-motion`. Hero and generator behavior untouched.
2. **Player: welcome screen (2.2) + progress demotion (2.3).** One PR; touches `QuizPlayer.tsx` only, plus the `start` event timing.
3. **Player: accent theming (2.4).** Migration 0005, editor color input, player CSS var + contrast guard. Server-side: `/q/[slug]` page selects `theme_accent` and passes it down.
4. **Verification pass:** the full loop (generate → edit → publish → take quiz on a REAL PHONE → lead captured → owner email) plus the B1-B6 checklist on a published quiz. Confirm watermark still forced for free owners and that the player carries zero twilight styling.

## 4. Done criteria (amended)

1. `/` is a complete marketing page (hero already live + new body sections) and the generate flow still works exactly as today for anon and authed users, including the signup replay.
2. The player passes B1-B6 on a real published quiz on a phone, with the new welcome screen and step-count-first progress.
3. A quiz with `theme_accent` set renders visibly as the owner's surface; with it unset, the neutral ink default renders. Watermark behavior unchanged.
4. Nothing from §2.5 was built.
5. Core loop verified end to end after the changes (`npm run build` clean, prod deploy, real run).

## 5. Research notes (2026-06-13 web check)

- Progress indicators: pairing a step count with subtle visual momentum outperforms either alone; bars backfire when early progress reads as slow (our `index/total` fill showed 0% on Q1). 3-6 steps is the completion sweet spot; our generator targets ~6 questions, which fits. ([FormCrafts](https://formcrafts.com/help/features/multi-step-forms), [Anve multi-step form data](https://voiceforms.anvevoice.app/blog/multi-step-form-best-practices/), [Breadcrumb Digital](https://www.breadcrumbdigital.com.au/multi-step-form-design-part-1-progress-indicators-and-field-labels/))
- Welcome screens: displaying the total question count and a concrete time number on the first screen is the recommended pattern ("a visible, reassuring signal that the commitment is finite"); ~3 minutes is the completion ceiling, our ~60s estimate sits well inside it. ([GrowthLens quiz completion](https://www.growthlens.io/blog/quiz-funnel-completion-rate-optimization), [Interact quiz conversion report](https://www.tryinteract.com/blog/quiz-conversion-rate-report/))
- Benchmarks to read our analytics against: ~40% of quiz starters convert to leads on average; 50-65% completion is a good target for a 10-question quiz, higher for shorter. ([Interact](https://www.tryinteract.com/blog/quiz-conversion-rate-report/), [Outgrow benchmarks](https://outgrow.co/blog/quiz-engagement-benchmarks-completion-rates))

---

## 6. Naming & routing taxonomy — "Workspace" and the path to multi-tenancy (decided 2026-06-13)

**Decision:** "Dashboard" is the wrong word for the owner's home — it's where their quizzes live and where they work, not a metrics overview (the real metrics surface is `/analytics/[id]`). We renamed the **user-facing label** to **"Workspace"** but deliberately **kept the route at `/dashboard`**. Users read link text, not paths; renaming the route is finite-but-real churn (auth callback redirect, `login?next=`, Stripe success `/dashboard?upgraded=1`, AuthOverlay `next`, trial-reminder email manage URL, nav) with no user value. Label changed in: `dashboard/page.tsx` h1, `Generator.tsx` nav, and the `← Workspace` back-links in `analytics/[id]`, `leads/[id]`, `EditQuizClient`.

**The three-stage routing taxonomy (locked, so nobody builds the wasteful middle step):**

| Stage | Home | Per-quiz analytics | Workspace rollup ("real dashboard") | Tenant scoping |
| --- | --- | --- | --- | --- |
| Now | `/dashboard` (labeled "Workspace") | `/analytics/[id]` | — | implicit (owner_id) |
| Mid-term | `/dashboard` | `/analytics/[id]` | `/analytics` (bare index) | implicit |
| Multi-workspace | `/w/[slug]` | `/w/[slug]/analytics/[id]` | `/w/[slug]/analytics`; cross-workspace account rollup at `/account` | explicit (`workspace_id` + membership RLS) |

**Rejected: the `/workspace` (singular) half-step.** Its only payoff was "free up `/dashboard` for the rollup," but under path-scoping the rollup is `/w/[slug]/analytics` and bare `/dashboard`/`/workspace` both cease to exist — so it's an intermediate you'd migrate away from. If we ever migrate the home route, we go straight to the destination shape `/w/[slug]`, not `/workspace`.

**Why path-scoping is the destination (not a cookie "active workspace"):** agencies need multi-tab, deep-linkable, shareable, bookmarkable per-client URLs; a session/cookie active-tenant breaks all of that. Path scoping (`/w/[slug]`) is the standard team-in-the-path pattern. It is the more *scalable* surface on the product + codebase axes (self-describing URLs, no hidden global tenant state); it is neutral on raw performance — the actual scale lever is the `workspace_id` + membership + RLS data model underneath, not the URL shape. This is NOT the `/app/*` migration rejected in §2.1: that was cosmetic prefixing with no user value; a tenant slug carries real meaning and is required by the feature.

**Multi-tenancy is deferred — agencies are NOT central to the first 6 months (user, 2026-06-13).** Our wedge is solo business owners (med spas, coaches); multi-workspace is the Growth-tier ($89/mo) agency upsell (spec §5.9, "shown not built"). Build it as ONE migration when a paying agency / real second-workspace demand appears, not speculatively. The work splits into three layers with very different cost curves: **Layer 1** data substrate (`workspaces` + `workspace_members` tables, `workspace_id` on quizzes/leads/quiz_events, a default personal workspace per user) is the only piece meaningfully cheaper-while-small; **Layer 2** the RLS rewrite (`owner_id = auth.uid()` → membership) is where the cost AND risk live and depends on a permission model we can't design until we know the agency shape, so doing it early adds rework risk, not savings; **Layer 3** routing (`/w/[slug]`) + switcher + UI is the pure feature. Trigger to start: first paying agency / first real request for a second workspace. Until then: label = "Workspace", route = `/dashboard`, no schema change.
