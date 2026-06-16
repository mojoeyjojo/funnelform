import "server-only";
import type { EmailDestination, EspContact, EspCredentials, EspTarget } from "./types";

const BASE = "https://api.kit.com/v4";

async function call(apiKey: string, path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "X-Kit-Api-Key": apiKey, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export const kit: EmailDestination = {
  id: "kit",
  label: "Kit (ConvertKit)",
  async validateCredentials(creds: EspCredentials) {
    try {
      const res = await call(creds.apiKey, "/account");
      return res.ok ? { ok: true } : { ok: false, error: `Kit returned ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "request failed" };
    }
  },
  async listTargets(creds: EspCredentials): Promise<EspTarget[]> {
    const res = await call(creds.apiKey, "/forms");
    if (!res.ok) throw new Error(`Kit forms ${res.status}`);
    const data = (await res.json()) as { forms?: { id: number; name: string }[] };
    return (data.forms ?? []).map((f) => ({ id: String(f.id), name: f.name }));
  },
  async upsertSubscriber(creds: EspCredentials, targetId: string, contact: EspContact) {
    const sub = await call(creds.apiKey, "/subscribers", {
      method: "POST",
      body: JSON.stringify({ email_address: contact.email, first_name: contact.name ?? undefined, fields: contact.fields }),
    });
    if (!sub.ok) throw new Error(`Kit subscriber ${sub.status}`);
    const form = await call(creds.apiKey, `/forms/${targetId}/subscribers`, {
      method: "POST",
      body: JSON.stringify({ email_address: contact.email }),
    });
    if (!form.ok) throw new Error(`Kit form add ${form.status}`);
    if (contact.tags.length > 0) {
      const tagsRes = await call(creds.apiKey, "/tags");
      if (!tagsRes.ok) throw new Error(`Kit tags lookup ${tagsRes.status}`);
      const data = (await tagsRes.json()) as { tags?: { id: number; name: string }[] };
      const existing = data.tags ?? [];
      for (const tagName of contact.tags) {
        const match = existing.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
        let tagId = match?.id;
        if (tagId === undefined) {
          const created = await call(creds.apiKey, "/tags", {
            method: "POST",
            body: JSON.stringify({ name: tagName }),
          });
          if (!created.ok) throw new Error(`Kit create tag ${created.status}`);
          const body = (await created.json()) as { tag?: { id: number } };
          if (!body.tag) throw new Error("Kit create tag returned no tag");
          tagId = body.tag.id;
        }
        const tagRes = await call(creds.apiKey, `/tags/${tagId}/subscribers`, {
          method: "POST",
          body: JSON.stringify({ email_address: contact.email }),
        });
        if (!tagRes.ok) throw new Error(`Kit tag ${tagRes.status}`);
      }
    }
  },
};
