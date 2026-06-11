"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

// Reusable auth surface: passwordless email magic link + Google OAuth (Google is
// wired but only works once the provider is configured in Supabase — it's a
// drop-in, no code change needed to enable). `next` is where the user lands
// after the auth round-trip.
export default function AuthForm({ next = "/dashboard" }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl() },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function signInWithGoogle() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl() },
    });
    if (error) setError(error.message);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-[var(--hairline)] p-5 text-sm">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-[var(--muted)]">
          We sent a magic link to <strong>{email}</strong>. Click it to continue.
          Your quiz will be waiting.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={sendMagicLink} className="flex gap-2" noValidate>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@business.com"
          disabled={loading}
          className="flex-1 rounded-full border border-[var(--hairline)] px-5 py-3 text-sm outline-none focus:border-[var(--signal)]"
        />
        <button
          type="submit"
          disabled={loading || !email.trim()}
          className="rounded-full bg-[var(--foreground)] px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[var(--signal)] disabled:opacity-40"
        >
          {loading ? "Sending…" : "Email me a link →"}
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
    </div>
  );
}
