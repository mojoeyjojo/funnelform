# Testimonial headshots

Drop reviewer headshots here, then wire each one up in
`src/content/niches.ts` by setting the testimonial's `avatar` field to its path.

- Path format: `/testimonials/<file>` (this folder is served from the site root,
  so a file named `lara.jpg` here is referenced as `/testimonials/lara.jpg`).
- Square images look best (they are cropped to a circle, 44x44 on screen). A
  ~200x200 source keeps them crisp on retina screens.
- Supported: .jpg / .png / .webp.
- If a testimonial has no `avatar`, the card automatically shows the reviewer's
  initials instead, so you can add headshots one at a time.

Example in `niches.ts`:

    {
      name: "Lara Mendes",
      role: "Med Spa Owner",
      result: "...",
      avatar: "/testimonials/lara.jpg",
    },
