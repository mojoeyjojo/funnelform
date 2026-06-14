import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The published quiz player is meant to be embedded on owners' sites
        // (the §5.4 iframe option). Explicitly allow framing from anywhere so a
        // future global frame guard can't silently break embeds.
        source: "/q/:slug*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
