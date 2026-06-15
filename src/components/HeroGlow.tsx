// The dark marketing hero backdrop: a near-true-black canvas with the accent
// radial wash blooming from the top (design board: Gradients & Atmosphere). The
// light in the scene comes from the accent, not the surface, so the same single
// action colour that paints the buttons also lights the page. Shared so the
// homepage generator and the niche landing pages render the identical field.
// Pure presentational markup (no hooks): works in server and client components.
// Pair the parent section with `relative isolate overflow-hidden` so this
// -z-10 layer sits behind the content.
export function HeroGlow() {
  return (
    <div
      aria-hidden
      className="bg-hero-glow pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    />
  );
}
