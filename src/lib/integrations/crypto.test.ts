import { describe, it, expect, beforeAll, vi } from "vitest";

// server-only throws in non-Next.js environments; mock it so the pure
// crypto functions are testable without a server context.
vi.mock("server-only", () => ({}));

import { encryptSecret, decryptSecret } from "./crypto";

beforeAll(() => {
  // 32-byte key, base64. Deterministic for the test run only.
  process.env.INTEGRATIONS_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("crypto", () => {
  it("round-trips a secret", () => {
    const blob = encryptSecret("sk_live_abc123");
    expect(blob).not.toContain("sk_live_abc123");
    expect(decryptSecret(blob)).toBe("sk_live_abc123");
  });

  it("produces a different ciphertext each call (random iv)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects a tampered ciphertext", () => {
    const blob = encryptSecret("secret");
    const parts = blob.split(":");
    const tampered = `${parts[0]}:${parts[1]}:${Buffer.from("xxxx").toString("base64")}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
