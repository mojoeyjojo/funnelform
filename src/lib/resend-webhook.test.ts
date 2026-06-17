import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
vi.mock("server-only", () => ({}));
import { verifyResendWebhook } from "./resend-webhook";

// Build a valid Svix signature for the given parts.
function sign(secret: string, id: string, timestamp: string, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const sig = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return `v1,${sig}`;
}

const SECRET = "whsec_" + Buffer.from("a-test-signing-key-32-bytes-long!").toString("base64");
const BODY = JSON.stringify({ type: "domain.updated", data: { id: "d1", status: "verified" } });

describe("verifyResendWebhook", () => {
  const nowTs = String(Math.floor(Date.now() / 1000));

  it("accepts a correctly signed payload", () => {
    const headers = { id: "msg_1", timestamp: nowTs, signature: sign(SECRET, "msg_1", nowTs, BODY) };
    expect(verifyResendWebhook(BODY, headers, SECRET)).toBe(true);
  });

  it("accepts when the header carries multiple space-delimited signatures", () => {
    const good = sign(SECRET, "msg_1", nowTs, BODY);
    const headers = { id: "msg_1", timestamp: nowTs, signature: `v1,bogussig ${good}` };
    expect(verifyResendWebhook(BODY, headers, SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const headers = { id: "msg_1", timestamp: nowTs, signature: sign(SECRET, "msg_1", nowTs, BODY) };
    expect(verifyResendWebhook(BODY + "x", headers, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const headers = { id: "msg_1", timestamp: nowTs, signature: sign(SECRET, "msg_1", nowTs, BODY) };
    const other = "whsec_" + Buffer.from("a-different-key-of-some-length!!").toString("base64");
    expect(verifyResendWebhook(BODY, headers, other)).toBe(false);
  });

  it("rejects a stale timestamp (replay)", () => {
    const old = String(Math.floor(Date.now() / 1000) - 60 * 60);
    const headers = { id: "msg_1", timestamp: old, signature: sign(SECRET, "msg_1", old, BODY) };
    expect(verifyResendWebhook(BODY, headers, SECRET)).toBe(false);
  });

  it("rejects when the secret or headers are missing", () => {
    expect(verifyResendWebhook(BODY, { id: "m", timestamp: nowTs, signature: "v1,x" }, undefined)).toBe(false);
    expect(verifyResendWebhook(BODY, { id: null, timestamp: nowTs, signature: "v1,x" }, SECRET)).toBe(false);
  });
});
