"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { posthogKey } from "@/lib/analytics";

// Initializes PostHog once on mount IF a key is configured; otherwise a pure
// pass-through (no init, no network). Keeps analytics dormant until launch.
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = posthogKey();
    if (!key || posthog.__loaded) return;
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
    });
  }, []);
  return <>{children}</>;
}
