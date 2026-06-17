import "server-only";

const BASE = "https://api.resend.com";

function key(): string {
  const k = process.env.RESEND_API_KEY;
  if (!k) throw new Error("RESEND_API_KEY is not set");
  return k;
}

export interface ResendDomainRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  status: string;
  ttl?: string;
  priority?: number;
}

export interface ResendDomain {
  id: string;
  status: string;
  records: ResendDomainRecord[];
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

// Find an already-registered domain by exact name (the list response omits the
// per-record details, so fetch the full record for a match).
export async function findResendDomainByName(name: string): Promise<ResendDomain | null> {
  const res = await call("/domains");
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: { id: string; name: string }[] };
  const match = (data.data ?? []).find((d) => d.name === name);
  return match ? getResendDomain(match.id) : null;
}

// Register the domain, or reuse it if Resend already has it. A prior Remove
// deletes our row but the domain can linger in Resend (or a delete can fail),
// so re-adding must recover gracefully instead of 502-ing. On ANY create
// failure we look the domain up by name: if it already exists we reuse it
// (covers "already registered" and a domain that is present but tripped the
// account's domain-count limit). Only a genuinely-absent domain throws, and the
// thrown message carries Resend's own text so the caller can react (e.g. to the
// plan limit).
export async function ensureResendDomain(name: string): Promise<ResendDomain> {
  const res = await call("/domains", { method: "POST", body: JSON.stringify({ name }) });
  if (res.ok) return (await res.json()) as ResendDomain;
  const body = await res.text().catch(() => "");
  const existing = await findResendDomainByName(name);
  if (existing) return existing;
  let detail = "";
  try {
    detail = (JSON.parse(body) as { message?: string }).message ?? "";
  } catch {
    // non-JSON body; fall through to the status code
  }
  throw new Error(detail || `Resend create domain ${res.status}`);
}

export async function deleteResendDomain(id: string): Promise<void> {
  const res = await call(`/domains/${id}`, { method: "DELETE" });
  // 404 = already gone; treat as success so teardown is idempotent.
  if (!res.ok && res.status !== 404) throw new Error(`Resend delete domain ${res.status}`);
}

export async function verifyResendDomain(id: string): Promise<void> {
  const res = await call(`/domains/${id}/verify`, { method: "POST" });
  if (!res.ok) throw new Error(`Resend verify ${res.status}`);
}

// Returns the full domain so callers can refresh both the overall status and
// the per-record DNS statuses (records default to [] for a minimal response).
export async function getResendDomain(id: string): Promise<ResendDomain> {
  const res = await call(`/domains/${id}`);
  if (!res.ok) throw new Error(`Resend get domain ${res.status}`);
  const json = (await res.json()) as Partial<ResendDomain>;
  return { id: json.id ?? id, status: json.status ?? "pending", records: json.records ?? [] };
}

// Collapse Resend's domain status vocabulary onto the three states our
// sending_domains row + UI understand. Resend reports not_started / pending /
// verifying / verified / failed / temporary_failure; we surface a hard failure
// so the owner sees the "Failed" badge and re-checks DNS instead of waiting on
// a "Pending" that will never clear.
export function mapDomainStatus(resendStatus: string): "verified" | "failed" | "pending" {
  if (resendStatus === "verified") return "verified";
  if (resendStatus === "failed" || resendStatus === "temporary_failure") return "failed";
  return "pending";
}
