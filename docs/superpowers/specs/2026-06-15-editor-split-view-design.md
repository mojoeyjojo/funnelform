# Editor v2 — split-view live editor

**Date:** 2026-06-15
**Status:** approved (design)

## Goal

Turn the saved-quiz editor (`/edit/[id]`) from a single scroll column into a real
split-view editor: a structure sidebar, the editor, and a **live preview of the
quiz player** side by side. The owner edits the quiz, sees the player update live,
clicks Save to persist, and Publish to go live. Mobile-first and fully responsive.

This is **workspace light mode** — we apply our accent/color system, NOT a dark
theme. The dashboard and workspace stay light.

## Non-goals (v1)

- Adding / removing / reordering questions, options, or outcomes. The editor stays
  **text-edit only**, exactly as it is today (`QuizView` edits copy in place).
- Editing the email sequence (stays display-only preview).
- Per-keystroke autosave. Persistence remains an explicit **Save** (PATCH), per the
  build plan.

## Key decisions (from brainstorming)

- **Preview sync:** live as you type. The preview player reads the same in-memory
  `quiz` state the editor mutates. Save/Publish persist separately.
- **Mobile:** an `Edit | Preview` segmented toggle swaps the single column.
- **Sidebar:** full structure nav (Overview · Questions · Outcomes · Follow-ups)
  with click-to-scroll + scroll-spy active highlighting.
- **Settings:** a collapsible "Quiz settings" block at the top of the editor pane.

## Architecture

### Routes / data (unchanged)

`src/app/edit/[id]/page.tsx` keeps loading the quiz server-side and rendering
`EditQuizClient` + the guest `AuthOverlay`. No prop changes.

### `EditQuizClient.tsx` — rebuilt as the editor app shell

Holds the same state it does today (`quiz`, `whatsapp`, `branding`, `accent`,
`state` save-state, `publishState`, `slug`, rating, delete). Layout becomes:

- **Sticky topbar:** wordmark · breadcrumb `My quizzes / {title}` · right cluster:
  status pill (clean/dirty/saving/Saved/error, emerald when saved), **Save**,
  **Publish** (+ **Unpublish** when live). On `< xl` the topbar also shows the
  `Edit | Preview` segmented toggle and a **Structure** button (opens the sidebar
  drawer).
- **Publish banners:** the existing `published` / `blocked` (bad CTA URL) /
  `plan_blocked` / `error` messages move to a dismissible banner strip directly
  under the topbar (same copy and logic, new placement).
- **Workspace grid:** three independently-scrolling panes (see Responsive).

### `StructureNav.tsx` (new)

Props: the quiz, `activeId`, `onNavigate(id)`. Renders nav sections:
- **Overview** → `settings` anchor
- **Questions** → `q-0 … q-(n-1)` (label = question text, truncated; numbered Q1…)
- **Outcomes** → `o-0 … o-(m-1)` (label = outcome name)
- **Follow-ups** → `emails` anchor

Active item uses the signal accent (bg `signal-600` low-alpha, text `signal-600`).
Clicking calls `onNavigate(id)`. On `< xl` it lives in a left drawer overlay
toggled by the topbar **Structure** button.

### `QuizView.tsx` — additive anchors only

Add a stable `id` to each question block (`id="q-{qi}"`), each outcome block
(`id="o-{oi}"`), the title/settings region, and the email section (`id="emails"`).
These are inert for the generate-flow and free-tool (`readOnly`) consumers. No
behavior change.

### Quiz settings block

Extract the WhatsApp / brand color / Treeflow badge / delete cards (and the
`?new=1` first-impression rating bar) into a collapsible **Quiz settings** section
rendered at the top of the editor pane under `id="settings"`, extracted into
`QuizSettings.tsx` to keep `EditQuizClient` lean; same handlers
(`editWhatsapp`, `editBranding`, `editAccent`, `deleteQuiz`).

### `QuizPlayer.tsx` — add `preview?: boolean`

When `preview` is true:
- `fireEvent` is a no-op (no analytics events from the editor).
- `LeadForm` stays visible (the owner sees the real visitor flow) and still
  validates client-side, but on submit it advances straight to the outcome
  **without** calling `/api/leads` — no fake leads.
- Outer container drops `min-h-screen` and fills its frame instead.
- The "Made with Treeflow" badge link is inert (no navigation).

Absent the prop, the public player behaves exactly as today.

### Preview pane

Renders `<QuizPlayer preview title={quiz.title} config={quiz.config}
accent={accent} whatsapp={whatsapp} branding={branding} placement=... />` inside a
phone frame on a tinted (`paper`/`mist`) canvas, fed by live state. A **Restart**
control resets the player to its welcome phase (remount via a `key` bump).

## Data flow

```
edit input → editField()/editWhatsapp()/editAccent()… → quiz/whatsapp/accent state
                                   │
                 ┌─────────────────┴─────────────────┐
            QuizView (editor inputs)         QuizPlayer (preview, live)
                                   │
                                 Save → PATCH /api/quizzes/[id]
                               Publish → POST /api/quizzes/[id]/publish
```

Live preview assumes question/option **counts are stable** while previewing — true
today (text-only editing). If structural editing is added later, the player must
clamp `qIndex` to the current length.

## Scroll-spy

The editor pane is the scroll container. An IntersectionObserver watches the
section anchors (`settings`, `q-*`, `o-*`, `emails`) and sets `activeId`.
`onNavigate(id)` does `el.scrollIntoView({ behavior: "smooth", block: "start" })`
within the editor pane.

## Color translation (mockup → our system)

Drop the mockup's `--t1/--b1/--r-*` parallel variables. Use our tokens:

| Mockup            | Ours                                              |
| ----------------- | ------------------------------------------------- |
| `--accent #2546ff`| `signal-600` (#3834ff) — active nav, focus, primary button |
| `--bg #f4f4f2`    | `paper` / `mist` — preview canvas, app background  |
| `--surface #fff`  | white surfaces                                     |
| borders `b1..b3`  | `--hairline` (ink-200) / ink-100                   |
| text `t1..t4`     | `--foreground` / `--muted` / ink-400 / ink-300     |
| `--success`       | emerald (existing Saved/published styling)         |
| radii `r-*`       | Tailwind `rounded-*` scale used across the app     |
| Geist / Geist Mono| already the app fonts (`--font-sans`/`--font-mono`)|

Player preview keeps the **owner's** `theme_accent` (the mockup's "customer's
colour, not ours" — already how the `accent` prop works).

## Responsive (mobile-first)

- **< 768px:** single column. Topbar `Edit | Preview` toggle swaps editor ↔
  full-width player. **Structure** opens a left drawer. No phone frame on the
  preview (the screen is the phone).
- **768–1279px:** two panes — editor | preview. Sidebar → toggled left drawer.
- **≥ 1280px (xl):** three panes — sidebar (~280px) | editor (1fr) | preview
  (phone frame on a tinted canvas).

## Files touched

- `src/components/EditQuizClient.tsx` — rebuilt shell (topbar, grid, panes, drawer,
  segmented toggle, banner strip).
- `src/components/StructureNav.tsx` — new.
- `src/components/QuizSettings.tsx` — new (extracted settings + rating).
- `src/components/QuizView.tsx` — additive section anchors.
- `src/components/QuizPlayer.tsx` — `preview` prop.
- `src/app/edit/[id]/page.tsx` — unchanged unless the shell needs full-bleed layout
  (it may need to opt out of any global max-width wrapper).

## Verification

- `tsc --noEmit`, eslint, `npm run build` clean.
- Manual: edit text → preview updates live; Save persists; Publish flow + all four
  banner states; mobile toggle + drawer; scroll-spy highlights correct section;
  preview fires no analytics and creates no leads (network tab).
