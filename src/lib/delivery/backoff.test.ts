import { describe, it, expect } from "vitest";
import { nextRetryDelayMs } from "./backoff";

describe("nextRetryDelayMs", () => {
  it("grows exponentially from a 30s base", () => {
    expect(nextRetryDelayMs(0)).toBe(30_000);
    expect(nextRetryDelayMs(1)).toBe(60_000);
    expect(nextRetryDelayMs(2)).toBe(120_000);
  });

  it("caps at 1 hour", () => {
    expect(nextRetryDelayMs(20)).toBe(3_600_000);
  });
});
