"use client";

import { useState } from "react";
import Link from "next/link";
import type { OutputRating } from "@/lib/types";

export function QuizSettings({
  whatsapp,
  webhook,
  branding,
  accent,
  hasPro,
  rating,
  onRate,
  onWhatsapp,
  onWebhook,
  onBranding,
  onAccent,
  onDelete,
}: {
  whatsapp: string;
  webhook: string;
  branding: boolean;
  accent: string | null;
  hasPro: boolean;
  rating?: OutputRating | null;
  onRate?: (r: OutputRating) => void;
  onWhatsapp: (v: string) => void;
  onWebhook: (v: string) => void;
  onBranding: (showBadge: boolean) => void;
  onAccent: (v: string | null) => void;
  onDelete: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div id="sec-settings" data-nav-section className="scroll-mt-6">
      {onRate && <RatingBar rating={rating ?? null} onRate={onRate} />}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-4 flex w-full items-center justify-between rounded-2xl border border-[var(--hairline)] bg-white px-4 py-3 text-left text-sm font-semibold transition-colors hover:border-black/20"
        aria-expanded={open}
      >
        <span>Quiz settings</span>
        <span className="font-mono text-[11px] text-[var(--muted)]">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {/* WhatsApp delivery (build spec section 5.6) */}
          <div className="rounded-2xl border border-[var(--hairline)] p-4">
            <p className="text-sm font-semibold">WhatsApp delivery (optional)</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Add your WhatsApp number and the results page shows a “Continue on WhatsApp”
              button, prefilled with the visitor’s result. Use international format.
            </p>
            <input
              type="tel"
              value={whatsapp}
              onChange={(e) => onWhatsapp(e.target.value)}
              placeholder="+31 6 12345678"
              className="mt-3 w-full max-w-xs rounded-full border border-[var(--hairline)] px-4 py-2.5 text-sm outline-none focus:border-[var(--signal)]"
            />
          </div>

          {/* Webhook delivery (Zapier / Make / raw catch hooks) */}
          <div className="rounded-2xl border border-[var(--hairline)] p-4">
            <p className="text-sm font-semibold">Webhook (optional)</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              We POST each new lead as JSON to this URL. Works with Zapier or Make catch hooks.
            </p>
            <input
              type="url"
              value={webhook}
              onChange={(e) => onWebhook(e.target.value)}
              placeholder="https://hooks.zapier.com/..."
              className="mt-3 w-full max-w-xs rounded-full border border-[var(--hairline)] px-4 py-2.5 text-sm outline-none focus:border-[var(--signal)]"
            />
          </div>

          {/* Treeflow branding (section 5.9) */}
          <div className="rounded-2xl border border-[var(--hairline)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Treeflow branding</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {hasPro
                    ? "Hide the “Made with Treeflow” badge on your published quiz."
                    : "Removing the “Made with Treeflow” badge is a Pro feature."}
                </p>
              </div>
              {hasPro ? (
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={!branding}
                    onChange={(e) => onBranding(!e.target.checked)}
                    className="h-4 w-4 accent-[var(--signal)]"
                  />
                  Remove badge
                </label>
              ) : (
                <Link
                  href="/pricing"
                  className="shrink-0 rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold transition-colors hover:border-[var(--signal)] hover:text-[var(--signal)]"
                >
                  Upgrade to Pro
                </Link>
              )}
            </div>
          </div>

          {/* Brand color (design-pass section 2.4) */}
          <div className="rounded-2xl border border-[var(--hairline)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Brand color</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Sets the accent on your published quiz (progress, selected answers, and buttons).
                  Leave it on the default for a clean neutral look.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {accent && (
                  <button
                    type="button"
                    onClick={() => onAccent(null)}
                    className="text-xs font-semibold text-[var(--muted)] underline underline-offset-4 transition-colors hover:text-[var(--signal)]"
                  >
                    Reset
                  </button>
                )}
                <input
                  type="color"
                  value={accent ?? "#0a0a0a"}
                  onChange={(e) => onAccent(e.target.value)}
                  aria-label="Brand color"
                  className="h-9 w-9 cursor-pointer rounded-lg border border-[var(--hairline)] bg-transparent p-0.5"
                />
              </div>
            </div>
          </div>

          {/* Delete */}
          <div className="border-t border-[var(--hairline)] pt-4">
            {confirmDelete ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-rose-800">
                  Delete this quiz? It moves to Recently deleted for 30 days, then it&rsquo;s gone for
                  good. Your leads are kept until then.
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                    className="rounded-full border border-[var(--hairline)] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:bg-[var(--e-surface-3)] disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await onDelete();
                      } finally {
                        setDeleting(false);
                      }
                    }}
                    disabled={deleting}
                    className="rounded-full bg-rose-600 px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-rose-700 disabled:opacity-40"
                  >
                    {deleting ? "Deleting…" : "Delete quiz"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs font-semibold text-rose-700 underline underline-offset-4 transition-colors hover:text-rose-800"
              >
                Delete this quiz
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RatingBar({
  rating,
  onRate,
}: {
  rating: OutputRating | null;
  onRate: (r: OutputRating) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-full border border-[var(--hairline)] px-4 py-2.5">
      <span className="text-xs text-[var(--muted)]">First impression?</span>
      {(["love_it", "not_quite"] as const).map((r) => {
        const selected = rating === r;
        return (
          <button
            key={r}
            onClick={() => onRate(r)}
            disabled={rating !== null}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              selected
                ? "bg-[var(--signal)] text-white"
                : "text-[var(--foreground)] hover:bg-[var(--signal)]/10 disabled:opacity-40"
            }`}
          >
            {r === "love_it" ? "Love it" : "Not quite"}
          </button>
        );
      })}
      {rating && <span className="text-xs text-emerald-600">Thanks, recorded.</span>}
    </div>
  );
}

// Embeddable iframe snippet (section 5.4), shown inside the editor Share card.
export function EmbedSnippet({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const safeTitle = (title || "Quiz").replace(/"/g, "'");
  const snippet = `<iframe src="${url}" title="${safeTitle}" loading="lazy" style="width:100%;height:760px;border:0;border-radius:16px"></iframe>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked, the field is selectable as a fallback
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--hairline)] pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold text-[var(--foreground)]">Want it on your own site?</p>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-full border border-[var(--hairline)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--e-text-2)] transition-colors hover:border-black/20"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <p className="mt-1 text-[12px] text-[var(--muted)]">
        Paste this where you want the quiz to appear. Works on WordPress, Webflow, Squarespace, Wix,
        and most site builders.
      </p>
      <textarea
        readOnly
        value={snippet}
        rows={3}
        onClick={(e) => e.currentTarget.select()}
        className="mt-2 w-full resize-none rounded-[10px] border border-[var(--hairline)] bg-white p-3 font-mono text-[11px] leading-relaxed text-[var(--e-text-2)] outline-none"
      />
    </div>
  );
}
