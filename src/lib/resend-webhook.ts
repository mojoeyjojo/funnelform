import "server-only";
import crypto from "node:crypto";

// Resend signs webhooks with Svix: HMAC-SHA256 over `${id}.${timestamp}.${body}`
// keyed by the base64 secret (after the `whsec_` prefix), base64-encoded. The
// svix-signature header is a space-delimited list of `v1,<sig>` entries.
// https://docs.svix.com/receiving/verifying-payloads/how-manual

export interface ResendDomainEventRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  status: string;
  ttl?: string;
  priority?: number;
}

export interface ResendWebhookEvent {
  type: string;
  created_at?: string;
  data?: {
    id?: string;
    name?: string;
    status?: string;
    records?: ResendDomainEventRecord[];
  };
}

const TOLERANCE_SECONDS = 5 * 60;

export function verifyResendWebhook(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  // Replay guard: reject timestamps outside the tolerance window.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  for (const part of signature.split(" ")) {
    const comma = part.indexOf(",");
    const sig = comma === -1 ? part : part.slice(comma + 1);
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}
