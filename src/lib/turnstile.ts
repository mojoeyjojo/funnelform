import "server-only";

// Cloudflare Turnstile verification for the free tool's bot challenge (spec
// §5.10/§8). Verifies the client token server-side against Cloudflare.
//
// If TURNSTILE_SECRET_KEY is NOT configured, verification is SKIPPED (returns
// true) so the free tool works before the keys are added — the 1/IP/24h cap is
// the backstop. Once the secret is set, a valid token becomes required.
// Never throws.
export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured -> skip (rate limit still applies)
  if (!token) return false;

  try {
    const form = new URLSearchParams();
    form.append("secret", secret);
    form.append("response", token);
    if (ip && ip !== "unknown") form.append("remoteip", ip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data?.success);
  } catch {
    return false;
  }
}
