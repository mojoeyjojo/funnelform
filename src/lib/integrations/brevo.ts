import "server-only";
import type { EmailDestination, EspContact, EspCredentials, EspTarget } from "./types";

const BASE = "https://api.brevo.com/v3";

async function call(key: string, path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json", ...(init?.headers ?? {}) },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const brevo: EmailDestination = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: "brevo" as any,
  label: "Brevo",
  async validateCredentials(creds: EspCredentials) {
    try {
      const res = await call(creds.apiKey, "/account");
      return res.ok ? { ok: true } : { ok: false, error: `Brevo returned ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "request failed" };
    }
  },
  async listTargets(creds: EspCredentials): Promise<EspTarget[]> {
    const res = await call(creds.apiKey, "/contacts/lists?limit=50");
    if (!res.ok) throw new Error(`Brevo lists ${res.status}`);
    const data = (await res.json()) as { lists?: { id: number; name: string }[] };
    return (data.lists ?? []).map((l) => ({ id: String(l.id), name: l.name }));
  },
  async upsertSubscriber(creds: EspCredentials, targetId: string, contact: EspContact) {
    const attributes: Record<string, string> = {};
    if (contact.name) attributes.FIRSTNAME = contact.name;
    for (const [k, v] of Object.entries(contact.fields)) attributes[k.toUpperCase()] = v;
    const res = await call(creds.apiKey, "/contacts", {
      method: "POST",
      body: JSON.stringify({ email: contact.email, attributes, listIds: [Number(targetId)], updateEnabled: true }),
    });
    if (!res.ok) throw new Error(`Brevo upsert ${res.status}`);
  },
};
