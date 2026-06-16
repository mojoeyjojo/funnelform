import "server-only";

const BASE = "https://api.resend.com";

function key(): string {
  const k = process.env.RESEND_API_KEY;
  if (!k) throw new Error("RESEND_API_KEY is not set");
  return k;
}

export interface ResendDomain {
  id: string;
  status: string;
  records: { record: string; name: string; type: string; value: string; status: string }[];
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function createResendDomain(name: string): Promise<ResendDomain> {
  const res = await call("/domains", { method: "POST", body: JSON.stringify({ name }) });
  if (!res.ok) throw new Error(`Resend create domain ${res.status}`);
  return (await res.json()) as ResendDomain;
}

export async function verifyResendDomain(id: string): Promise<void> {
  const res = await call(`/domains/${id}/verify`, { method: "POST" });
  if (!res.ok) throw new Error(`Resend verify ${res.status}`);
}

export async function getResendDomain(id: string): Promise<{ status: string }> {
  const res = await call(`/domains/${id}`);
  if (!res.ok) throw new Error(`Resend get domain ${res.status}`);
  return (await res.json()) as { status: string };
}
