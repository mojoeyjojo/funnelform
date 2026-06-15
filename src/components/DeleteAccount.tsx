"use client";

import { useState } from "react";

// Quiet danger zone on the dashboard. A plain text button expands to a confirm
// row; confirming hits DELETE /api/account, then full-reloads to "/" so the now
// dead session is cleared. Mirrors the delete-confirm styling in QuizSettings.
export default function DeleteAccount() {
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  async function onDelete() {
    setDeleting(true);
    setError(false);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      window.location.href = "/";
    } catch {
      setError(true);
      setDeleting(false);
    }
  }

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="text-xs font-semibold text-rose-700 underline underline-offset-4 transition-colors hover:text-rose-800"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-rose-800">
        <p>
          This permanently deletes your account, all quizzes, and all leads. This
          cannot be undone.
        </p>
        {error && (
          <p className="mt-2 font-semibold">
            Couldn&rsquo;t delete just now. Please try again.
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => {
            setConfirm(false);
            setError(false);
          }}
          disabled={deleting}
          className="rounded-full border border-[var(--hairline)] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:bg-[var(--e-surface-3)] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded-full bg-rose-600 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-rose-700 disabled:opacity-40"
        >
          {deleting ? "Deleting…" : "Delete everything"}
        </button>
      </div>
    </div>
  );
}
