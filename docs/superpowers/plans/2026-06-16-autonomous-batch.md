# Autonomous Batch Implementation Plan

> Execute top to bottom, one task at a time, verify (tsc + eslint + build) and commit each before moving on. Branch: `feature/autonomous-batch`. No user input required for any task.

**Goal:** Ship the self-contained, no-keys-needed items from the MVP-spec gap list.

**Scope (in):** GDPR data-deletion, webhook lead delivery, comparison `/vs/*` pages, editor polish, PostHog wiring (dormant until key).
**Scope (out, by user/agent decision):** coaches/agencies niche pages (user will do later), ES/PT localization (large + needs native review), native email integrations / Google Sheets (provider OAuth), Stripe live flip, real testimonials, key rotation, real-device QA.

**Project facts (verified):**
- Supabase: `createSupabaseServerClient()` (auth'd, async) and `createSupabaseAdminClient()` (service role, sync) in `src/lib/supabase/server.ts`. Admin client has `auth.admin.deleteUser`.
- Lead delivery lives in `src/app/api/leads/route.ts` (admin client; writes lead + `quiz_events` + owner-notify email). The quiz row select there must add `delivery`.
- `src/app/api/quizzes/[id]/route.ts` PATCH maps `whatsapp` into the `delivery` jsonb by OVERWRITING it (`update.delivery = w ? {whatsapp:w} : {}`). Webhook must be merged into the same object.
- Editor settings UI is `src/components/QuizSettings.tsx` (neutral `.editor-ui` palette); state/handlers + save payload live in `src/components/EditQuizClient.tsx`. No em dashes anywhere.
- Marketing template + tokens: `src/components/marketing.tsx`, dark hero palette + `.editor-ui`/light tokens in `globals.css`.

---

## Task A — GDPR account + data deletion

**Files:** Create `src/app/api/account/route.ts`; modify `src/app/dashboard/page.tsx` (or `src/components/AccountMenu.tsx`) for a danger-zone "Delete account & data" UI (new small client component if cleaner).

- `DELETE /api/account` (runtime nodejs): get the current user via `createSupabaseServerClient()`; if none, 401. With `createSupabaseAdminClient()`, in order: delete `leads` where `owner_id = user.id`, `quiz_events` for the user's quizzes (lookup quiz ids first, or delete by quiz_id IN (...)), `builder_events` where `owner_id`, `quizzes` where `owner_id`, `profiles` where `id = user.id`, then `auth.admin.deleteUser(user.id)`. Return `{ ok: true }`. Best-effort: log and continue table-by-table; only hard-fail if `deleteUser` errors.
- UI: a confirm flow ("This permanently deletes your account, quizzes, and leads. This cannot be undone.") that on confirm calls `DELETE /api/account`, then redirects to `/` (a full reload clears the session). Reuse the existing confirm pattern from QuizSettings delete. Place it as a quiet "Delete account" danger zone in the dashboard footer.
- Verify: tsc + eslint clean; build. Manual test deferred (would delete a real account).
- Commit: `feat: GDPR account + data deletion endpoint and danger-zone UI`

## Task B — Comparison `/vs/[competitor]` pages

**Files:** Create `src/content/comparisons.ts`; create `src/app/vs/[competitor]/page.tsx`.

- `comparisons.ts`: a `COMPARISONS` array, one entry per competitor (`outgrow`, `typeform`, `scoreapp`, `interact`), each `{ slug, name, metaTitle, metaDescription, h1, intro, rows: { feature, treeflow, them }[], faqs }`. Copy must be DEFENSIBLE and accuracy-safe: lead with Treeflow's category difference ("most quiz tools hand you a blank builder; Treeflow writes the funnel for you"), keep competitor claims general and category-level (no specific prices, no unverifiable feature assertions). `getComparison(slug)` helper + export the slugs.
- `/vs/[competitor]/page.tsx`: `dynamicParams=false`, `generateStaticParams` from the slugs, `generateMetadata` per entry, `notFound()` for unknown. Render with the SAME dark marketing system as the niche pages (reuse `SiteHeader`/`CtaButton`/`Footer` or the marketing primitives where exported; otherwise a self-contained dark page using the existing tokens — no em dashes, no new color system). Sections: hero (eyebrow "Treeflow vs {name}", h1, sub, CTA to `/?utm_source=vs_{slug}`), a comparison table (Feature · Treeflow · {name}), a short FAQ, footer. Mobile-first.
- Verify: tsc + eslint; build shows `/vs/[competitor]` as SSG with 4 params. `curl` the dev routes return 200; unknown returns 404.
- Commit: `feat: comparison /vs/* pages (outgrow, typeform, scoreapp, interact)`

## Task C — Webhook lead delivery (Zapier / raw)

**Files:** `src/app/api/quizzes/[id]/route.ts` (PATCH), `src/app/api/leads/route.ts`, `src/components/QuizSettings.tsx`, `src/components/EditQuizClient.tsx`.

- PATCH: add `webhook: z.string().max(2000).optional()` to the schema and the "at least one field" refine. Rebuild delivery from BOTH fields so neither clobbers the other:
  ```ts
  if (parsed.data.whatsapp !== undefined || parsed.data.webhook !== undefined) {
    const delivery: Record<string, string> = {};
    const w = (parsed.data.whatsapp ?? "").trim();
    const hook = (parsed.data.webhook ?? "").trim();
    if (w) delivery.whatsapp = w;
    if (hook) delivery.webhook = hook;
    update.delivery = delivery;
  }
  ```
  NOTE: because the editor always sends current values for both, this full-rebuild is correct. (If only one field is sent, the other is read as "" and dropped — acceptable since the editor sends both.)
- `/api/leads/route.ts`: add `delivery` to the quiz select. After the owner-notify block, if `(quiz.delivery as {webhook?: string})?.webhook` is a valid http(s) URL, POST the lead JSON (`{ quiz_id, name, email, phone, answers, outcome_id, outcome_name, created_at }`) to it. Fire-and-forget with an AbortController 5s timeout in its own try/catch; never block or fail the visitor. Record a `builder_events` row `event_type: "owner_notified", metadata: { channel: "webhook" }` on a 2xx.
- `EditQuizClient.tsx`: add `webhook` state (init from a new `initialWebhook` prop) + `editWebhook` (sets dirty); include `webhook` in the save PATCH body; pass `webhook`/`onWebhook` to `QuizSettings`. Add `initialWebhook` to props and read it in `src/app/edit/[id]/page.tsx` from `delivery.webhook`.
- `QuizSettings.tsx`: a "Webhook (optional)" field under the WhatsApp card — label, helper ("We POST each new lead as JSON to this URL. Works with Zapier/Make catch hooks."), input bound to `webhook`/`onWebhook`, neutral `.editor-ui` styling.
- `src/app/edit/[id]/page.tsx`: select already includes `delivery`; pass `initialWebhook={(data.delivery as {webhook?: string} | null)?.webhook ?? ""}`.
- Verify: tsc + eslint + build clean.
- Commit: `feat: webhook lead delivery (owner-configured POST per lead)`

## Task D — Editor polish

**Files:** `src/components/EditQuizClient.tsx`, `src/components/QuizView.tsx`, `src/components/QuizPlayer.tsx`.

- Delete-failure feedback: `deleteQuiz` currently silently no-ops on `!res.ok`. Make it `throw` on failure; `QuizSettings`'s delete button already wraps `onDelete` in try/finally — add a small error message there on catch ("Couldn't delete just now. Please try again.").
- Lint: fix the pre-existing `react-hooks/set-state-in-effect` on the rating effect in `EditQuizClient` by reading the URL param in a lazy `useState` initializer instead of an effect:
  ```ts
  const [ratingSession] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return p.get("new") === "1" ? (p.get("sid") ?? "unknown") : null;
  });
  ```
  remove the now-dead effect. For the `QuizPlayer` `react-hooks/refs`+`purity` errors (session-id init during render), move the localStorage/session-id init into a `useEffect` that sets a `sessionId` state (init `""`), and guard the first `view` fire to run after the id is set; if a clean refactor risks the analytics ordering, instead wrap the existing block in a documented `// eslint-disable-next-line react-hooks/refs react-hooks/purity` with a one-line rationale rather than changing behavior. Prefer the real fix; fall back to the documented disable only if behavior would change.
- Verify: tsc + eslint (target zero errors in these three files) + build.
- Commit: `fix: editor delete feedback + resolve pre-existing editor lint`

## Task E — PostHog wiring (dormant until key)

**Files:** `package.json` (add `posthog-js`), create `src/lib/analytics.ts`, create `src/components/PostHogProvider.tsx`, modify `src/app/layout.tsx`, and add `capture()` calls in `src/components/EditQuizClient.tsx` + `src/components/Generator.tsx`.

- `npm install posthog-js`.
- `src/lib/analytics.ts`: `export function capture(event: string, props?: Record<string, unknown>)` that calls `posthog.capture` only if `posthog.__loaded`; a `getPosthogKey()` reading `process.env.NEXT_PUBLIC_POSTHOG_KEY`. All no-ops when the key is absent.
- `PostHogProvider.tsx` (client): on mount, if `NEXT_PUBLIC_POSTHOG_KEY` set, `posthog.init(key, { api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com", capture_pageview: true })`. Renders `children`. If no key, just renders children (no init).
- `layout.tsx`: wrap `{children}` in `<PostHogProvider>`.
- Capture the claim-critical client events (guarded helper, safe when off): in `EditQuizClient` — `output_rating` (in `recordRating`) and `published` (on publish success); in `Generator` — `generate_started` / `generate_succeeded` at the existing pipeline points. Keep it light; autocapture covers pageviews/clicks.
- Verify: tsc + eslint + build clean; with no key, the provider must not init (no console errors). 
- Commit: `feat: PostHog wiring (dormant until NEXT_PUBLIC_POSTHOG_KEY set)`

---

## Final
- Full `npm run build`, em-dash sweep across all touched files, summary of commits. Do NOT deploy or merge (leave on the branch for the user to review/merge).
