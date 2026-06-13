import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Quiz-transfer token: lets a guest (anonymous user) prove, after signing in
// to an EXISTING account, that they controlled guest user X — so X's quizzes
// can be reassigned to them. Supabase can't merge two users; we move the rows.
//
// Stateless HMAC, keyed with SUPABASE_SECRET_KEY (already server-only, no new
// env var). The token carries only { sub: guestUserId, exp }. The DESTINATION
// is never in the token — /api/transfer/complete always uses the caller's own
// authenticated user id, so a leaked token can't redirect quizzes anywhere
// the attacker doesn't already control a session for.

const TTL_SECONDS = 60 * 60; // 1 hour: covers the auth round-trip comfortably.

function secret(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not configured");
  return key;
}

function sign(payload: string): Buffer {
  return createHmac("sha256", secret()).update(payload).digest();
}

export function mintTransferToken(anonUserId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: anonUserId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

// Returns the guest user id, or null for anything malformed/forged/expired.
export function verifyTransferToken(token: string): string | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = sign(payload);
    const got = Buffer.from(sig, "base64url");
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof parsed.sub !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed.sub;
  } catch {
    return null;
  }
}
