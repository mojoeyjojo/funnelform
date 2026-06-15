import posthog from "posthog-js";

// Product analytics, dormant until NEXT_PUBLIC_POSTHOG_KEY is set (see
// PostHogProvider). All helpers no-op when PostHog was never initialized, so
// call sites stay safe with or without a key.
export function posthogKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY;
}

export function capture(event: string, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  // __loaded is true only after a successful posthog.init.
  if (!posthog.__loaded) return;
  posthog.capture(event, props);
}
