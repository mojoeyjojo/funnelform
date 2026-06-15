import dns from "node:dns/promises";
import net from "node:net";

// SSRF guard for owner-supplied webhook URLs. A quiz owner (anyone who signs up)
// can set an arbitrary webhook URL that our server then POSTs each lead to, so an
// unguarded fetch is a textbook server-side request forgery: pointed at the cloud
// metadata endpoint (169.254.169.254), localhost, or an RFC1918 address it would
// reach internal services from inside our network. We require https and refuse any
// target that resolves to a non-public address. The send-time DNS check is the
// real defense (hostnames can resolve to private IPs and change over time);
// store-time validation is defense in depth plus immediate feedback in the editor.

// True if an IPv4 literal is loopback / private / link-local / reserved.
function ipv4Blocked(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 (unspecified)
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (100.64.0.0/10)
  if (a >= 224) return true; // multicast + reserved
  return false;
}

// True if an IPv6 literal is loopback / unspecified / link-local / unique-local,
// or an IPv4-mapped address whose embedded v4 is blocked.
function ipv6Blocked(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return ipv4Blocked(mapped[1]);
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
  return false;
}

function ipBlocked(ip: string): boolean {
  return net.isIPv4(ip) ? ipv4Blocked(ip) : ipv6Blocked(ip);
}

function hostOf(url: URL): string {
  // Strip the brackets around IPv6 literals.
  return url.hostname.replace(/^\[|\]$/g, "");
}

// Sync, store-time check (no DNS): well-formed https URL that is not an IP literal
// in a blocked range and not an obvious localhost. Use this when persisting the
// webhook so an obviously-bad value is rejected with immediate feedback.
export function isWellFormedWebhookUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = hostOf(url);
  if (!host || host.toLowerCase() === "localhost" || host.toLowerCase().endsWith(".localhost")) {
    return false;
  }
  if (net.isIP(host) && ipBlocked(host)) return false;
  return true;
}

// Async, send-time check: resolve the host and reject if ANY resolved address is
// non-public. This is the authoritative guard before fetching.
export async function isSafeWebhookTarget(raw: string): Promise<boolean> {
  if (!isWellFormedWebhookUrl(raw)) return false;
  const host = hostOf(new URL(raw));
  if (net.isIP(host)) return !ipBlocked(host);
  try {
    const records = await dns.lookup(host, { all: true });
    if (records.length === 0) return false;
    return records.every((r) => !ipBlocked(r.address));
  } catch {
    return false;
  }
}
