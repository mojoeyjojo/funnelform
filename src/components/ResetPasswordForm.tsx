"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import PasswordInput from "./PasswordInput";

// New-password form for /auth/reset. The recovery link already created a
// session via /auth/callback, so updateUser just sets the password.
export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <PasswordInput
        value={password}
        onChange={setPassword}
        placeholder="New password (min 6 characters)"
        autoComplete="new-password"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || password.length < 6}
        className="w-full rounded-full bg-[var(--foreground)] px-6 py-3 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-[var(--signal)] disabled:opacity-40"
      >
        {loading ? "Saving…" : "Save password →"}
      </button>
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </form>
  );
}
