import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for ESP API keys at rest. Key is INTEGRATIONS_ENC_KEY: 32 raw bytes
// supplied base64 in the environment. Stored format is "ivB64:tagB64:ctB64".
function key(): Buffer {
  const raw = process.env.INTEGRATIONS_ENC_KEY;
  if (!raw) throw new Error("INTEGRATIONS_ENC_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("INTEGRATIONS_ENC_KEY must decode to 32 bytes");
  return buf;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(blob: string): string {
  const [ivB64, tagB64, ctB64] = blob.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
