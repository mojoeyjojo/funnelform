# Light surfaces style guide

The marketing pages (`/` and `/[niche]`) render on the **dark** hero theme
(`design-board-dark-v2`: near-black canvas, one `#2546ff` accent, white-ish text).
Against that dark field we place a handful of **light objects**: the product
mocks (the example quiz phone, the scored-result / email / WhatsApp cards) and the
embedded generator wizard on the homepage.

Every light object on the dark hero shares ONE surface. They must, or the hero
looks like two different products bolted together. We learned this the hard way:
the wizard once used frosted `glass` while the mocks used a solid white card, and
they clashed.

## The rule

> A light object placed on the dark hero uses the `surface-card` utility:
> a **solid white** card, the float shadow, and a hairline ink ring.
> Never `glass` on the dark hero.

`surface-card` is defined in `src/app/globals.css` and is the single source of
truth. It equals what the product mocks always used: `bg-white` + `shadow-float`
+ `ring-1 ring-ink-950/5`. Inside the card, use the light/ink text scale
(`text-ink-950`, `text-ink-600`, borders `border-ink-200`), the same as the mocks.

```
surface-card        white card, float shadow, hairline ink ring  ← light objects on dark
```

Variants that intentionally differ (don't "fix" these to match):

- **PhoneFrame** — a white screen inside an `bg-ink-950` bezel. The bezel is the
  point; the inner screen is still plain `bg-white`.
- **TestimonialCard** — a `from-white to-paper` gradient with a deeper shadow, a
  deliberately brighter "moment" in the testimonial marquee.

## `glass` vs `surface-card`

| Surface        | Where                                                        |
| -------------- | ------------------------------------------------------------ |
| `surface-card` | Light objects on the **dark** hero (marketing pages).        |
| `glass`        | Light objects on a **light** backdrop: the `/new` + homepage-history builder over `HeroSky`. |

`glass` is translucent white. On a light sky it frosts beautifully; on near-black
it turns grey and muddy. That is exactly the mismatch `surface-card` prevents.

## Where it's wired

- `surface-card` utility: `src/app/globals.css`.
- Product mocks: `src/components/marketing.tsx` (use `surface-card`).
- Wizard cards: `src/components/Generator.tsx` — the `Panel` picks its surface
  from `SurfaceContext`. The hero layout wraps the cards in
  `<SurfaceContext.Provider value="card">`; the page (light) layout uses the
  default `"glass"`. The same `cards` tree is reused by both layouts, which is why
  the surface comes from context rather than a prop.
