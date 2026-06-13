import { createSupabaseBrowserClient } from "./supabase/browser";

// The signup funnel's hand luggage: when a rate-limited visitor is sent off to
// create an account, their prompt is stashed in localStorage so the homepage
// can replay it automatically once they come back authenticated. They asked
// for a quiz; signing up should produce that quiz, not a blank input.

const KEY = "ff_pending_prompt";

export type PendingPrompt = {
  // The exact body that was POSTed to /api/generate ({ input } or
  // { description: {...} }), minus the session id.
  payload: Record<string, unknown>;
  // Best-effort source_url for the eventual save (null for text prompts).
  src: string | null;
};

export function stashPendingPrompt(p: PendingPrompt): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable (private mode, quota). The funnel still works; they
    // just retype their prompt after signing up.
  }
}

// Read-and-clear: a stashed prompt is replayed at most once.
export function takePendingPrompt(): PendingPrompt | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as PendingPrompt;
    if (!parsed || typeof parsed !== "object" || !parsed.payload) return null;
    return { payload: parsed.payload, src: parsed.src ?? null };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Quiz transfer: when a guest signs in to an EXISTING account (instead of
// converting their guest user), their quizzes would be stranded. Before any
// auth flow that may land on a different user, we mint a transfer token (proof
// of guest ownership) and stash it; TransferCompleter redeems it once a
// permanent session shows up.
// ---------------------------------------------------------------------------

const TRANSFER_KEY = "ff_transfer_token";

// No-op unless there is a guest session to transfer out of.
export async function prepareTransfer(): Promise<void> {
  try {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getUser();
    if (data.user?.is_anonymous !== true) return;
    const res = await fetch("/api/transfer/start", { method: "POST" });
    if (!res.ok) return;
    const { token } = (await res.json()) as { token?: string };
    if (token) localStorage.setItem(TRANSFER_KEY, token);
  } catch {
    // Storage or network unavailable. Worst case: the guest quiz stays behind,
    // same as before this feature existed.
  }
}

// Read-and-clear, mirroring takePendingPrompt.
export function takeTransferToken(): string | null {
  try {
    const token = localStorage.getItem(TRANSFER_KEY);
    if (token) localStorage.removeItem(TRANSFER_KEY);
    return token;
  } catch {
    return null;
  }
}

// Rate-limited without an account: stash the prompt, then route into signup.
// Guests (anonymous session) land on their dashboard under the mandatory auth
// overlay, with their earlier quizzes visible behind it. Visitors with no
// session at all go straight to the login page. Both auth flows land on
// /building, which replays the stash with a visible progress widget.
export async function funnelToSignup(p: PendingPrompt): Promise<void> {
  stashPendingPrompt(p);
  let hasSession = false;
  try {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getUser();
    hasSession = Boolean(data.user);
  } catch {
    // no session resolvable; login page it is
  }
  window.location.href = hasSession ? "/dashboard?auth=1" : "/login?next=/building";
}
