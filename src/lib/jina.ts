// Jina AI Reader: GET https://r.jina.ai/{url} -> clean markdown, no API key.
// Used to turn a business URL into context for the generation prompt.

// A site that scrapes to fewer than this many words is treated as thin/blocked,
// and the client is shown the 3-field "tell us about your business" fallback.
export const THIN_SITE_WORD_THRESHOLD = 150;

const JINA_TIMEOUT_MS = 15_000;

/** True if the input looks like a single bare/qualified URL (vs a description). */
export function looksLikeUrl(input: string): boolean {
  const t = input.trim();
  if (!t || /\s/.test(t)) return false; // multiple words -> treat as description
  return /^(https?:\/\/)?[^\s.]+\.[^\s.]{2,}/i.test(t);
}

export function normalizeUrl(input: string): string {
  const t = input.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Fetch a URL through Jina Reader and return clean markdown.
 *
 * Authenticates with JINA_API_KEY when set. Keyless reads are rate-limited per
 * IP and, once an IP earns "bad network reputation", Jina returns 401 for all
 * anonymous queries — which would make every site look thin. A free key lifts
 * that. We keep the keyless path as a fallback for unblocked environments. */
export async function fetchSiteMarkdown(normalizedUrl: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JINA_TIMEOUT_MS);
  const apiKey = (process.env.JINA_API_KEY ?? process.env.JINA_KEY)?.trim();
  try {
    const res = await fetch(`https://r.jina.ai/${normalizedUrl}`, {
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "markdown",
        // `direct` skips the headless-browser render — much faster for the
        // mostly server-rendered marketing sites our users have. Thin-site
        // detection still catches anything that comes back too sparse.
        "X-Engine": "direct",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Jina Reader returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
