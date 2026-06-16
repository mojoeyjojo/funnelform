import "server-only";
import type { EmailDestination, EspContact, EspCredentials, EspTarget } from "./types";

const BASE = "https://connect.mailerlite.com/api";

async function call(token: string, path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const mailerlite: EmailDestination = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  id: "mailerlite" as any,
  label: "MailerLite",
  async validateCredentials(creds: EspCredentials) {
    try {
      const res = await call(creds.apiKey, "/groups?limit=1");
      return res.ok ? { ok: true } : { ok: false, error: `MailerLite returned ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "request failed" };
    }
  },
  async listTargets(creds: EspCredentials): Promise<EspTarget[]> {
    const res = await call(creds.apiKey, "/groups?limit=100");
    if (!res.ok) throw new Error(`MailerLite groups ${res.status}`);
    const data = (await res.json()) as { data?: { id: string; name: string }[] };
    return (data.data ?? []).map((g) => ({ id: String(g.id), name: g.name }));
  },
  async upsertSubscriber(creds: EspCredentials, targetId: string, contact: EspContact) {
    const fields: Record<string, string> = { ...contact.fields };
    if (contact.name) fields.name = contact.name;
    const res = await call(creds.apiKey, "/subscribers", {
      method: "POST",
      body: JSON.stringify({ email: contact.email, fields, groups: [targetId] }),
    });
    if (!res.ok) throw new Error(`MailerLite upsert ${res.status}`);
  },
};
