"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { prepareTransfer } from "@/lib/pendingPrompt";
import PasswordInput from "./PasswordInput";

// Reusable auth surface: email + password, plus Google OAuth.
//
// Three modes, toggleable in-form:
// - "signin": existing account. signInWithPassword is synchronous and stays in
//   this browser — which is what makes the stashed-prompt replay and the
//   guest-quiz transfer reliable.
// - "signup": brand-new account, no guest session. Confirm-email is ON, so
//   signUp ends in a check-your-email state.
// - "convert": the visitor has a GUEST session (anonymous sign-in). We must
//   NOT create a new user — that would orphan their quizzes. updateUser sets
//   email+password on the SAME user (email confirmation pending); Google uses
//   linkIdentity. Requires "Allow manual linking" in Supabase Auth settings.
//   If the email already has an account, we flip to signin: prepareTransfer
//   stashes a transfer token first, so the guest's quizzes follow them.
//
// `next` is where the user lands after the auth round-trip.
type Mode = "signin" | "signup" | "convert";

export default function AuthForm({
  next = "/dashboard",
  mode: initialMode = "signin",
}: {
  next?: string;
  mode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<"confirm" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function callbackUrl(target = next) {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`;
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setNotice(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    if (mode === "signin") {
      // Stash a transfer token BEFORE the session switches users.
      await prepareTransfer();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setLoading(false);
      if (error) {
        setError("Wrong email or password.");
        return;
      }
      // Full navigation so the server picks up the new session cookie;
      // TransferCompleter redeems the stashed token on the destination page.
      window.location.href = next;
      return;
    }

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: callbackUrl() },
      });
      setLoading(false);
      if (error) {
        if (/already.*(registered|exists|in use)/i.test(error.message)) {
          switchMode("signin");
          setNotice("That email already has an account. Sign in instead.");
        } else {
          setError(error.message);
        }
        return;
      }
      setSent("confirm");
      return;
    }

    // convert: upgrade the guest user in place.
    const { error } = await supabase.auth.updateUser(
      { email: email.trim(), password },
      { emailRedirectTo: callbackUrl() },
    );
    setLoading(false);
    if (error) {
      if (/already.*(registered|exists|in use)/i.test(error.message)) {
        // The flagged dead end, resolved: sign in to the existing account and
        // bring the guest quiz along via the transfer token.
        switchMode("signin");
        setNotice("That email already has an account. Sign in and we'll bring your quiz along.");
      } else {
        setError(error.message);
      }
      return;
    }
    setSent("confirm");
  }

  async function signInWithGoogle() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    // Always stash first: the OAuth round-trip may land on an existing user.
    await prepareTransfer();
    if (mode === "convert") {
      const { error } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo: callbackUrl() },
      });
      if (!error) return;
      // Google identity already belongs to another account: sign in to it
      // instead. The stashed token moves the guest quiz after the callback.
      if (!/already.*(linked|registered|exists|in use)/i.test(error.message)) {
        setError(error.message);
        return;
      }
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) setError(error.message);
  }

  async function forgotPassword() {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callbackUrl("/auth/reset"),
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent("reset");
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-[var(--hairline)] p-5 text-sm">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-[var(--muted)]">
          We sent a {sent === "reset" ? "password reset" : "confirmation"} link to{" "}
          <strong>{email}</strong>. Click it to continue.
          {sent === "confirm" && " Your quiz will be waiting."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notice && (
        <p className="rounded-2xl border border-[var(--hairline)] bg-[var(--background)] p-3 text-xs">
          {notice}
        </p>
      )}

      <form onSubmit={submit} className="space-y-2" noValidate>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@business.com"
          autoComplete="email"
          disabled={loading}
          className="w-full rounded-full border border-[var(--hairline)] px-5 py-3 text-sm outline-none focus:border-[var(--signal)]"
        />
        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder={mode === "signin" ? "Password" : "Password (min 6 characters)"}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="w-full rounded-full bg-[var(--foreground)] px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[var(--signal)] disabled:opacity-40"
        >
          {loading ? "One moment…" : mode === "signin" ? "Sign in →" : "Create account →"}
        </button>
      </form>

      <button
        type="button"
        onClick={signInWithGoogle}
        className="w-full rounded-full border border-[var(--hairline)] px-5 py-3 text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
      >
        Continue with Google
      </button>

      {error && <p className="text-xs text-rose-700">{error}</p>}

      <div className="flex items-center justify-between pt-1 text-xs text-[var(--muted)]">
        {mode === "signin" ? (
          <button
            type="button"
            onClick={() => switchMode(initialMode === "convert" ? "convert" : "signup")}
            className="underline underline-offset-4 hover:text-[var(--signal)]"
          >
            New here? Create a free account
          </button>
        ) : (
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className="underline underline-offset-4 hover:text-[var(--signal)]"
          >
            Already have an account? Sign in
          </button>
        )}
        {mode === "signin" && (
          <button
            type="button"
            onClick={forgotPassword}
            disabled={loading}
            className="underline underline-offset-4 hover:text-[var(--signal)]"
          >
            Forgot password?
          </button>
        )}
      </div>
    </div>
  );
}
