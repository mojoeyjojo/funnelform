import "server-only";
import { createHash } from "node:crypto";
import type { EmailDestination, EspContact, EspCredentials, EspTarget } from "./types";

// Datacenter is the suffix after the final hyphen of the key, and must look like
// a real Mailchimp dc (e.g. us21). Anything else is rejected to prevent the dc
// from being abused to redirect the request host (SSRF).
function parseDc(apiKey: string): string | null {
  const m = apiKey.match(/-([a-z]{2,4}\d{1,3})$/);
  return m ? m[1] : null;
}

function authHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`any:${apiKey}`).toString("base64")}`;
}

function subscriberHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

async function call(apiKey: string, path: string, init?: RequestInit): Promise<Response> {
  const dc = parseDc(apiKey);
  if (!dc) throw new Error("invalid Mailchimp API key format");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`https://${dc}.api.mailchimp.com/3.0${path}`, {
      ...init,
      headers: { Authorization: authHeader(apiKey), "Content-Type": "application/json", ...(init?.headers ?? {}) },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const mailchimp: EmailDestination = {
  id: "mailchimp",
  label: "Mailchimp",
  async validateCredentials(creds: EspCredentials) {
    try {
      const res = await call(creds.apiKey, "/ping");
      return res.ok ? { ok: true } : { ok: false, error: `Mailchimp returned ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "request failed" };
    }
  },
  async listTargets(creds: EspCredentials): Promise<EspTarget[]> {
    const res = await call(creds.apiKey, "/lists?count=100&fields=lists.id,lists.name");
    if (!res.ok) throw new Error(`Mailchimp lists ${res.status}`);
    const data = (await res.json()) as { lists?: { id: string; name: string }[] };
    return (data.lists ?? []).map((l) => ({ id: l.id, name: l.name }));
  },
  async upsertSubscriber(creds: EspCredentials, targetId: string, contact: EspContact) {
    const hash = subscriberHash(contact.email);
    const put = await call(creds.apiKey, `/lists/${targetId}/members/${hash}`, {
      method: "PUT",
      body: JSON.stringify({
        email_address: contact.email,
        status_if_new: "subscribed",
        merge_fields: contact.name ? { FNAME: contact.name } : undefined,
      }),
    });
    if (!put.ok) throw new Error(`Mailchimp upsert ${put.status}`);
    if (contact.tags.length > 0) {
      const tagRes = await call(creds.apiKey, `/lists/${targetId}/members/${hash}/tags`, {
        method: "POST",
        body: JSON.stringify({ tags: contact.tags.map((name) => ({ name, status: "active" })) }),
      });
      if (!tagRes.ok) throw new Error(`Mailchimp tag ${tagRes.status}`);
    }
  },
};
