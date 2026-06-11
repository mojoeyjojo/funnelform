import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "./supabase/server";

// Rate limiting for the public generate endpoint (cost/abuse protection, spec
// §8). Anonymous visitors are capped per hashed IP; signed-in users get a more
// generous per-account bucket. Counters live in the `rate_limits` table and are
// consumed atomically via the consume_rate_limit() Postgres function (service
// role only). FAIL OPEN: if the limiter itself errors or isn't configured, we
// allow the request. A limiter outage must never block real users.

const WINDOW_SECONDS = 24 * 60 * 60;
export const ANON_GENERATIONS_PER_DAY = 3;
export const USER_GENERATIONS_PER_DAY = 20;
// Free tool (spec §5.10): exactly 1 anonymous generation per IP per 24h, in a
// SEPARATE bucket from the landing endpoint. No regeneration.
export const FREE_TOOL_GENERATIONS_PER_DAY = 1;

export type RateLimitResult = {
  allowed: boolean;
  scope: "anon" | "user";
  limit: number;
};

// Hash the IP so raw addresses are never stored (privacy, spec §8 GDPR-aware).
function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

export async function consumeGenerateLimit(args: {
  userId: string | null;
  headers: Headers;
}): Promise<RateLimitResult> {
  const scope = args.userId ? ("user" as const) : ("anon" as const);
  const limit = args.userId ? USER_GENERATIONS_PER_DAY : ANON_GENERATIONS_PER_DAY;
  const key = args.userId
    ? `gen:user:${args.userId}`
    : `gen:ip:${hashIp(clientIpFromHeaders(args.headers))}`;

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_key: key,
      p_window_seconds: WINDOW_SECONDS,
      p_max: limit,
    });
    if (error) {
      console.error("[rate-limit] rpc failed (failing open):", error.message);
      return { allowed: true, scope, limit };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { allowed: Boolean(row?.allowed ?? true), scope, limit };
  } catch (err) {
    console.warn(
      "[rate-limit] unavailable (failing open):",
      err instanceof Error ? err.message : err,
    );
    return { allowed: true, scope, limit };
  }
}

// Free-tool limiter: 1 generation per IP per 24h, separate bucket. Fails open.
export async function consumeFreeToolLimit(headers: Headers): Promise<boolean> {
  const key = `freetool:ip:${hashIp(clientIpFromHeaders(headers))}`;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_key: key,
      p_window_seconds: WINDOW_SECONDS,
      p_max: FREE_TOOL_GENERATIONS_PER_DAY,
    });
    if (error) {
      console.error("[rate-limit] free-tool rpc failed (failing open):", error.message);
      return true;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return Boolean(row?.allowed ?? true);
  } catch (err) {
    console.warn("[rate-limit] free-tool unavailable (failing open):", err instanceof Error ? err.message : err);
    return true;
  }
}
