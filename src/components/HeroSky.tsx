import type { CSSProperties } from "react";

// The painterly daylight sky used as the hero background. Shared so the homepage
// generator and the niche landing pages render an identical scene: base sky →
// sunset gradient, a warm sun glow (top-right), a cool mint rise (bottom), and a
// drift of soft SVG cloud blobs. Pure presentational markup (no hooks), so it
// works in both server and client components. Pair the parent section with
// `relative isolate overflow-hidden` so the -z-10 layer sits behind the content.
const HERO_CLOUDS: CSSProperties[] = [
  { left: "4%", top: "6%", width: 280, height: 90, opacity: 0.85 },
  { right: "10%", top: "4%", width: 320, height: 100, opacity: 0.8 },
  { left: "14%", top: "34%", width: 260, height: 80, opacity: 0.7 },
  { right: "6%", top: "40%", width: 290, height: 88, opacity: 0.75 },
  { left: "36%", top: "64%", width: 340, height: 110, opacity: 0.7 },
  { right: "18%", bottom: "8%", width: 270, height: 84, opacity: 0.75 },
  { left: "6%", bottom: "4%", width: 230, height: 72, opacity: 0.65 },
];

export function HeroSky() {
  return (
    <div
      aria-hidden
      className="mask-fade-y pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      {/* base sky → sunset gradient */}
      <div className="bg-daylight-sky absolute inset-0" />

      {/* warm sun glow, top-right */}
      <div
        className="absolute rounded-full"
        style={{
          right: "8%",
          top: "-6%",
          height: 420,
          width: 420,
          filter: "blur(64px)",
          background:
            "radial-gradient(circle at center, rgba(255,231,186,0.95) 0%, rgba(255,212,156,0.55) 35%, rgba(255,212,156,0) 70%)",
        }}
      />

      {/* cool mint glow, bottom-center */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "40%",
          opacity: 0.6,
          background:
            "radial-gradient(60% 80% at 50% 100%, rgba(158,241,224,0.35), transparent 70%)",
        }}
      />

      {/* clouds */}
      {HERO_CLOUDS.map((style, i) => (
        <svg key={i} className="absolute" style={style} viewBox="0 0 200 80">
          <use href="#ff-cloud" />
        </svg>
      ))}

      {/* reusable cloud symbol */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <radialGradient id="ff-cloud-grad" cx="50%" cy="55%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="70%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <g id="ff-cloud" fill="url(#ff-cloud-grad)">
            <ellipse cx="60" cy="48" rx="42" ry="22" />
            <ellipse cx="100" cy="40" rx="36" ry="26" />
            <ellipse cx="140" cy="48" rx="40" ry="20" />
            <ellipse cx="80" cy="52" rx="30" ry="14" />
            <ellipse cx="120" cy="54" rx="34" ry="16" />
          </g>
        </defs>
      </svg>
    </div>
  );
}
