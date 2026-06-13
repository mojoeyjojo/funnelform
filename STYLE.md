# [Product] — Design Style Specification

A **"luminous twilight"** aesthetic: clean geometric typography over dreamy aurora gradients, crisp white product surfaces, frosted glass UI, and ink-indigo as the structural backbone. Premium, soft, optimistic, a little cosmic — built light-mode-first.

This is the design system for an AI quiz funnel generator. It applies across three surface types, which intentionally wear the aesthetic to different degrees:

1. **Marketing surfaces** (landing, niche pages, free tool, comparison pages) — the FULL twilight treatment described below.
2. **App surfaces** (dashboard, generate flow, editor, settings) — the same tokens, lighter touch: keep ink-indigo structure, glass, pill buttons, and `signal-600` actions, but prioritize clarity over atmosphere and use less motion.
3. **The public quiz player** (`/q/[slug]`) — **does NOT wear this aesthetic.** It is themed by the business owner (their accent color + logo), on a neutral, lightly-themeable base. Only the "Made with [Product]" watermark carries our brand. See Section 6a.

The system was originally extracted from a live source (`app/globals.css`, `app/fonts.ts`, `components/`). When in doubt, the code is the source of truth.

---

## 1. Design Principles

1. **Twilight over white.** The page lives between two poles — pure white product surfaces and a dawn/dusk gradient sky (deep indigo → violet → rose → peach). Sections transition _through_ gradient seams, never hard cuts.
2. **One geometric family, weight as hierarchy.** Body and headings are all Geist, a tight, heavy geometric sans; emphasis comes from weight and size, never a contrasting serif.
3. **Glass, not cards.** Interactive surfaces (pills, stat bars, inputs) are frosted glass with inner highlights — they float above the artwork rather than sit in boxes.
4. **Ink-indigo is the structure; signal-blue is the action.** Near-black indigo (`#0a0f2e`) carries all text/structure; one electric royal-blue (`#3834ff`) marks every primary action and hover.
5. **Motion is atmospheric, never UI-jittery.** Slow floats, opacity crossfades, scroll reveals, marquees — all CSS, all respecting `prefers-reduced-motion`.
6. **Tight tracking, dense weight.** Headlines run at 800 weight, `-0.035em` to `-0.04em` letter-spacing, `~0.98` line-height — confident and compressed.

---

## 2. Color System

### Core ink scale (structure + text)

The spine of the system — a desaturated indigo ramp from near-black to near-white.

| Token     | Hex       | Use                                    |
| --------- | --------- | -------------------------------------- |
| `ink-950` | `#0a0f2e` | Primary text, buttons, logo wordmark   |
| `ink-900` | `#0d1540` | —                                      |
| `ink-800` | `#151e53` | —                                      |
| `ink-700` | `#1f2b6b` | Emphasized heading / accent text       |
| `ink-600` | `#2e3a8a` | Body copy on light                     |
| `ink-500` | `#4750b4` | Helper / meta text                     |
| `ink-400` | `#6a72d6` | Icons, placeholders                    |
| `ink-300` | `#9099ec` | —                                      |
| `ink-200` | `#c5cbff` | Hairline dividers (at ~80% opacity)    |
| `ink-100` | `#e4e7ff` | —                                      |
| `ink-50`  | `#f3f4ff` | —                                      |

### Signal — the single action color

| Token        | Hex       | Use                                                        |
| ------------ | --------- | ---------------------------------------------------------- |
| `signal-600` | `#3834ff` | **Primary hover state**, emphasized stats, wavy underline  |
| `signal-500` | `#4f4bff` | Selection highlight, underline accent                      |
| `signal-400` | `#716fff` | —                                                          |

`::selection` → `signal-500` background, white text.

### Twilight gradient accents (the "sky")

| Token             | Hex       |
| ----------------- | --------- |
| `twilight-deep`   | `#1a0e4d` |
| `twilight-mid`    | `#5d2fa0` |
| `twilight-rose`   | `#f4a1c1` |
| `twilight-peach`  | `#ffd3b3` |
| `twilight-sky`    | `#b6d6ff` |
| `twilight-aqua`   | `#9ef1e0` |

### Neon accents (sparingly — "live" energy)

| Token          | Hex       | Use                          |
| -------------- | --------- | ---------------------------- |
| `neon-magenta` | `#ff3ca5` | Pulsing "live" dot on CTA    |
| `neon-orange`  | `#ff7a29` | Gradient text terminus       |
| `neon-teal`    | `#1ec4b2` | —                            |

### Soft surfaces

| Token   | Hex       | Use                       |
| ------- | --------- | ------------------------- |
| `pearl` | `#fafaf7` | Warm off-white section base |
| `paper` | `#f5f3ee` | —                         |
| `mist`  | `#eeecef` | —                         |

### Special accents

- **Hero rotating phrase yellow:** `#fcd065` (only on dark hero artwork).
- **Status colors:** success `emerald-500/700/300`, error `rose-300/700`.

### Signature gradients

```css
/* Twilight sky — radial dawn from indigo zenith to peach horizon */
twilight-sky: radial-gradient(120% 80% at 50% 0%, #1a0e4d 0%, #3a1a7a 25%, #8b4aa8 55%, #f4a1c1 82%, #ffd3b3 100%);

/* Dreamy — soft aurora cloud blobs over warm white */
dreamy:
  radial-gradient(60% 50% at 20% 10%, rgba(246,180,210,0.6), transparent 70%),
  radial-gradient(45% 40% at 85% 20%, rgba(182,214,255,0.55), transparent 70%),
  radial-gradient(70% 60% at 50% 110%, rgba(158,241,224,0.5), transparent 70%),
  linear-gradient(180deg, #fbf8ff 0%, #fef0ea 100%);

/* Section-seam gradient (page-level, white → blue → violet → rose → peach) */
linear-gradient(180deg, #fafaf7 0%, #eef2ff 14%, #e1ebff 32%, #f0e8ff 50%, #ffe6e3 72%, #ffd9c2 100%);

/* Gradient text (electric blue → magenta → orange) */
gradient-text: linear-gradient(90deg, #3834ff 0%, #ff3ca5 45%, #ff7a29 85%);
```

**Rule:** gradients are layered radial blobs + a base linear, always low-opacity and `pointer-events-none`, placed at `-z-10`. Aurora glow blobs use `blur-3xl` and `rounded-full`.

---

## 3. Typography

### Families

| Role               | Font           | Notes                                                                                                  |
| ------------------ | -------------- | ------------------------------------------------------------------------------------------------------ |
| **Sans (primary)** | **Geist**      | variable weight 400–900; everything: headings, body, UI, buttons, labels, navigation, inputs. Features `ss01`, `cv11` on. |
| **Mono**           | **Geist Mono** | technical / numeric labels: stat labels, event tags, schema-version labels, question numbers, tabular data, the builder_events panel. |

No serif family and no editorial accent. Hierarchy comes from weight and size within the one family.

Global: `letter-spacing: -0.01em`, antialiased, `text-rendering: optimizeLegibility`.

### Type scale (responsive, clamp-style steps)

| Element              | Mobile → Desktop          | Weight          | Tracking                  | Leading     |
| -------------------- | ------------------------- | --------------- | ------------------------- | ----------- |
| **Hero H1**          | 36 → 54 → 64 → **100px**  | 800             | `-0.04em`                 | `0.98`      |
| **Section H2**       | 34–38 → 48–52 → **58–64px** | 800 (extrabold) | `-0.035em`                | `0.98–1.05` |
| **Card H3**          | 22 → 26px                 | 800             | `-0.02em`                 | `1.1`       |
| **Lead paragraph**   | 16 → 18px                 | 400             | —                         | `1.6–1.65`  |
| **Body / card copy** | 14.5 → 15.5px             | 400             | —                         | `1.6`       |
| **UI label / helper** | 11–12.5px                | 500             | —                         | —           |
| **Eyebrow / "LIVE"** | 10px                      | 700             | `0.14em` UPPERCASE        | —           |
| **Button text**      | 11–13px                   | 700–800         | `0.1em` UPPERCASE         | —           |
| **Stats (tabular)**  | 15–16.5px                 | 800             | `-0.02em`, `tabular-nums` | `1`         |

### Signature treatments

- **Hero gradient text:** H1 filled with a vertical white gradient (95% → 40% → 92% opacity) + layered white glow `text-shadow` so type reads as luminous against dark artwork.
- **Wavy underline:** `underline wavy signal-500`, 2px, 6px offset.

---

## 4. Spacing, Layout & Radius

- **Container max-widths:** page `1320px`; content blocks `1200px`; text columns `760–860px`; lead paragraphs capped `620–640px`. Always `mx-auto`, centered.
- **Gutters:** `px-5` mobile → `sm:px-8`.
- **Section rhythm:** vertical padding `py-20 sm:py-28` (standard) up to `py-24 sm:py-32` (feature sections). Hero is taller: `min-h-[900px] lg:min-h-[1020px]`.
- **Grid:** 2-col feature grid (`md:grid-cols-2`), generous `gap-x-12 gap-y-16`.
- **Radii:**
  - `radius-card` = **22px** (`rounded-[22px]`) — media frames, video, large surfaces
  - `rounded-2xl` (16px) — image cards
  - `radius-pill` = **999px** — every button, input, stat bar, badge
- **Hairlines:** 1px dividers via `bg-ink-200/80`, height `h-3`.

---

## 5. Elevation — Glass & Shadow

### Glass utilities (the core surface language)

```css
/* glass — frosted light surface, for use on light/photo backgrounds */
background: linear-gradient(140deg, rgba(255,255,255,0.82), rgba(255,255,255,0.55) 50%, rgba(255,255,255,0.7));
backdrop-filter: blur(24px) saturate(140%);
border: 1px solid rgba(255,255,255,0.6);
box-shadow: 0 30px 60px -30px rgba(20,26,82,0.28), inset 0 1px 0 rgba(255,255,255,0.8);

/* glass-strong — near-opaque, for dark hero artwork (keeps text legible) */
/* whites at 0.96/0.88/0.94, blur(20px), border 0.7, heavier drop + inner highlight */

/* glass-dark — translucent indigo, for dark sections */
/* rgba(26,14,77,0.55 → 0.45), border rgba(255,255,255,0.12) */
```

**Rule:** `glass` on light backgrounds, `glass-strong` over photography / dark hero. Always pair with the `inset 0 1px 0 rgba(255,255,255,…)` top highlight — that "wet" edge is the signature.

### Shadow tokens

| Token          | Value                                                                   | Use                       |
| -------------- | ----------------------------------------------------------------------- | ------------------------- |
| `shadow-float` | `0 40px 80px -30px rgba(14,21,64,.25), 0 10px 30px -15px rgba(14,21,64,.12)` | Hero / large floating elements |
| `shadow-soft`  | `0 20px 50px -20px rgba(14,21,64,.18)`                                   | General lift              |
| Card shadow    | `0 18px 40px -20px rgba(14,21,64,.25), 0 2px 6px -2px rgba(14,21,64,.08)` + `ring-1 ring-ink-950/5` | Image cards |
| Button shadow  | `0 10px 30px -10px rgba(10,15,46,.5)`                                    | Dark pills                |

All shadows are **indigo-tinted (`rgba(14,21,64,…)`)**, never neutral gray — long, soft, low-opacity (the `-30px` / `-20px` negative spread). Cards get a 1px `ink-950/5` ring for crisp edge definition.

---

## 6. Components

### Primary button (pill CTA)

```
rounded-full · bg-ink-950 · text-white · font-bold uppercase tracking-[0.1em]
shadow-[0_10px_30px_-10px_rgba(10,15,46,0.5)]
transition-all · hover:bg-signal-600 · active:scale-[0.98]
```

- Heights: compact `h-8 sm:h-10`, default `h-9 sm:h-12`; pill padding `px-2.5–5`.
- Trailing arrow icon (`→`, 1.8 stroke). Optional leading **pulsing dot** (magenta `animate-ping`) for "live / beta" energy.
- Responsive label swap: short on mobile ("Build my quiz"), full on desktop ("Build my quiz funnel free").

### Input (glass pill field + inline button)

- Glass pill container, `pl-2`, holds a mail icon (`ink-400`) + transparent input + the dark submit pill, all on one row.
- Input: transparent bg, `font-medium text-ink-950`, `placeholder:text-ink-400`, no outline on focus.
- State rings: error `ring-2 ring-rose-300`, success `ring-2 ring-emerald-300`.
- Status line below: `aria-live="polite"`, emerald / rose / ink-500 by state, with reassuring microcopy ("No spam, no noise, just founder updates.").

### Stat bar (live counter)

- Glass pill, inline-flex, hairline-divided segments.
- "LIVE" eyebrow (10px / 700 / `0.14em`) + pulsing emerald dot (`animate-ping`, 2.4s).
- Numbers: `tabular-nums`, extrabold, smooth-tween on update (~650ms cubic ease-out); emphasized metric in `signal-600`.

### Image / media card

- `rounded-2xl` (or `rounded-[22px]` for video), `overflow-hidden`, white bg, `object-cover`, card shadow + `ring-1 ring-ink-950/5`. Fixed aspect ratio (e.g. `aspect-[1400/939]`).

### Nav

- Transparent, `sm:fixed` top. Blends into hero via a gradient-fade overlay + `backdrop-blur-sm` (mobile uses solid `rgba(0,0,0,0.65)` to match hero top).
- Logo mark + wordmark; wordmark uses `mix-blend-difference` to stay legible over any artwork.
- Right-side pill CTA with pulsing magenta dot.

### Product surfaces (this project's core components)

Beyond the marketing components above, these app surfaces use the same token system. Spec'd lightly here; the build spec defines behavior.

- **URL input + generate state:** the hero action. A glass pill input (like the email field) holding the URL, with the dark `signal`-hover submit pill. During generation, show calm progress states ("Reading your site… Writing your quiz… Building your results…") — atmospheric, not a jittery spinner. This is the magic moment; make it feel effortless.
- **Output rating:** a quiet one-tap "Love it / Not quite" pair on first view of the generated quiz (glass pills, ink text, `signal` on select). Non-blocking, low-emphasis — present but never in the way.
- **Editor:** lighter-touch app treatment. Inline-editable text fields on white/glass surfaces, ink-indigo structure, `signal-600` for primary actions and the "regenerate" affordance. Live preview pane renders the actual player. Minimal motion.
- **Dashboard / quiz list:** glass cards on the pearl base, pill buttons, tabular-nums for any counts (leads, completions). Clarity over atmosphere.

### 6a. Quiz player theming (`/q/[slug]`) — the carve-out

**The public quiz player does NOT wear the twilight aesthetic.** It is the business owner's surface, not ours.

- Base: a clean, neutral, mobile-first player (high-contrast, generous spacing, pill controls for radius consistency, but NO twilight gradients, NO aurora blobs, NO cosmic motion).
- Themeable by the owner: inherits their **accent color** (applied to progress, selected answers, CTA buttons) and their **logo**. Default to a neutral ink-on-white if they set nothing.
- Keep the structural quality bar (accessibility, tabular nums, reduced-motion, glass-pill inputs) but let the owner's brand lead the look.
- The ONLY place our brand appears: the **"Made with [Product]"** watermark on free-tier quizzes, using our `signal-600` wordmark, small and unobtrusive, linking back to us. Removed on paid tiers.
- Reason: a med spa's quiz must feel like the med spa, not like us. Our aesthetic sells the tool; the customer's aesthetic sells their service.

**Player UX law (evidence-backed, conversion research; see `docs/design-pass.md` §5 for sources). These are requirements, not suggestions:**

1. **One question per screen.** Exactly one question per view with a clear advance action. Never a scrolling list, never a multi-question page.
2. **Question order is sacred.** Easy questions first, qualifying later, contact capture LAST (at its configured placement, before results by default). No contact field ever appears before the capture step. The mechanism is foot-in-the-door: commitment through low-friction taps before the ask.
3. **Lead capture is 2 fields maximum.** Email (required) + phone (optional). Hard ceiling, enforced in the player render regardless of config. The GDPR consent checkbox is a legal control, not a field, and does not count. If more qualification data is ever needed, it becomes a quiz question (feels like value), never a form field (feels like cost).
4. **Progress = step count first.** "Question 3 of 6" in Geist Mono is the primary indicator. Any visual bar is hairline-subtle, secondary (below the count), and never shows 0% on question 1 (fill by current step, not completed steps).
5. **Mobile-first, strictly.** Design at mobile width and adapt up; most traffic arrives via shared links on phones. Full-width tappable option cards, generous touch targets, no hover-dependent affordances, SSR with lean client JS.
6. **Welcome screen surfaces the effort cost.** The start screen shows question count + a concrete time estimate as a designed element ("6 questions · about 60 seconds") with a single Start action. The `start` event fires on that tap.

### Voice / microcopy

Warm, confident, and practical — not cosmic or mystical. The user is a busy business owner (med spa, coach, agency) who wants leads, not a ritual. Speak plainly, in the second person, with quiet confidence that the hard work is already done for them. Optimistic and encouraging, never hypey or salesy.

**On-brand microcopy:** _"Paste your link. Watch the funnel build itself."_ · _"Your quiz is live."_ · _"First lead just landed."_ · _"We drafted a follow-up sequence — copy it into your email tool."_ · _"Add where this button should send people."_ · _"Create a free account to keep going."_

**Off-brand (do NOT use):** mystical/ritual framing, "inner circle," "founder access," anything cosmic or exclusive-club. That voice belonged to a different product. Here, the tone is a capable assistant that just did your work, not a secret society.

---

## 7. Motion

| Animation             | Spec                                      | Use                     |
| --------------------- | ----------------------------------------- | ----------------------- |
| `float-slow`          | 6s ease-in-out, `translateY -10px`        | Floating elements       |
| `float-slower`        | 9s, `-18px` + `-1.5deg`                   | Larger drifting elements |
| `pulse-soft`          | 3s, opacity 0.85 ↔ 1                       | Soft glows              |
| `drift`               | `translateX ±6%`                          | Background motion       |
| `shimmer`             | background-position sweep                 | Gradient shine          |
| `stars-twinkle`       | opacity 0.3 ↔ 1                            | Sparkle / star fields   |
| `marquee-left/right`  | 60s linear infinite, `will-change:transform` | Logo marquees        |
| `animate-ping`        | (Tailwind) 2.4s                           | Live dots               |

- **Scroll reveal** (`useReveal`): IntersectionObserver fires _once_ at 0.2 threshold, then disconnects. Toggles `translate-y-6 opacity-0` → `translate-y-0 opacity-100`, `600ms ease-out`, with staggered `transitionDelay` (e.g. `80ms × column`). Animation runs in CSS, never JS.
- **Crossfade text** (rotating phrase): single persistent span, opacity 1 ↔ 0 over 260ms `cubic-bezier(0.22,1,0.36,1)`, text swapped mid-fade. No remount / AnimatePresence (avoids mobile flash). Rotates every 3s.
- **Number tween:** rAF cubic ease-out over ~650ms; respects reduced-motion.
- **Hover:** `hover:bg-signal-600` + `active:scale-[0.98]` on all pills; `transition-all`.
- **Reduced motion:** global override collapses all animation / transition durations to `0.001ms`. Honor it everywhere.

---

## 8. Texture & Atmosphere

- **Grain:** very subtle radial-dot noise at `opacity-0.08`, `mix-blend-overlay`.
- **Scanlines:** 1px repeating linear-gradient at `rgba(255,255,255,0.04)` for dashboard-mock surfaces.
- **Clouds:** hand-built SVG ellipse clusters with radial white → transparent gradient fills, scattered at varying opacities (0.65–0.85) and `blur`.
- **Aurora blobs:** large `rounded-full blur-3xl` radial gradients in twilight colors, low opacity, behind content.
- **Section masking:** fade section edges with `mask-image: linear-gradient(180deg, transparent 0%, #000 12%, #000 88%, transparent 100%)` so gradients dissolve into neighbors.
- **Vignette:** radial dark ellipse behind hero text (`rgba(0,0,0,0.25) → 0`) for legibility over busy artwork.

---

## 9. Accessibility & Quality Bar

- Light-mode-only (`color-scheme: light`); white base, indigo text — high contrast.
- `sr-only` labels on inputs; `aria-live` / `role="status"` on async feedback; `aria-invalid` on errors; `aria-hidden` on all decorative layers.
- `noValidate` forms with shared client + server email validation.
- All decorative gradient / grain layers are `pointer-events-none`.
- Tabular numerals for any changing figures to prevent layout shift.
- Reduced-motion fully respected.

---

## One-line summary

> **Clean geometric Geist type, set in luminous gradient-white over a dawn-to-dusk twilight sky, on frosted-glass pills with indigo-tinted shadows — structural ink-indigo, electric royal-blue actions, slow atmospheric motion. Full force on marketing, lighter on the app, and deliberately absent on the customer-themed quiz player.**
