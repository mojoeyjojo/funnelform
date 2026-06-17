"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { EspProvider, OutputRating, QuizDestination, SendingDomain } from "@/lib/types";
import type { FollowUpConfig } from "@/lib/delivery/templates";

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
  followUp,
  onFollowUp,
  destinations,
  onDestinations,
  quizTitle,
  outcomes,
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
  followUp: FollowUpConfig;
  onFollowUp: (next: FollowUpConfig) => void;
  destinations: QuizDestination[];
  onDestinations: (next: QuizDestination[]) => void;
  quizTitle: string;
  outcomes: { id: string; name: string; description: string; hasCta: boolean }[];
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

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

          {/* Email service provider connections + per-quiz destination picker */}
          <IntegrationsCard destinations={destinations} onDestinations={onDestinations} />

          {/* Follow-up email */}
          <FollowUpCard
            followUp={followUp}
            onFollowUp={onFollowUp}
            quizTitle={quizTitle}
            outcomes={outcomes}
            hasPro={hasPro}
          />

          {/* Delete */}
          <div className="border-t border-[var(--hairline)] pt-4">
            {confirmDelete ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-rose-800">
                    Delete this quiz? It moves to Recently deleted for 30 days, then it&rsquo;s gone for
                    good. Your leads are kept until then.
                  </p>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDelete(false);
                        setDeleteError(false);
                      }}
                      disabled={deleting}
                      className="rounded-full border border-[var(--hairline)] bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition-colors hover:bg-[var(--e-surface-3)] disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setDeleting(true);
                        setDeleteError(false);
                        try {
                          await onDelete();
                        } catch {
                          setDeleteError(true);
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
                {deleteError && (
                  <p className="text-xs font-semibold text-rose-700">
                    Couldn&rsquo;t delete just now. Please try again.
                  </p>
                )}
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

// Shape returned by GET /api/integrations.
type IntegrationRow = { id: string; provider: string; status: string };

// Shape returned by POST /api/integrations and GET /api/integrations/[id].
type TargetRow = { id: string; name: string };

const PROVIDERS: { id: EspProvider; label: string }[] = [
  { id: "mailchimp", label: "Mailchimp" },
  { id: "kit", label: "Kit (ConvertKit)" },
  { id: "mailerlite", label: "MailerLite" },
  { id: "brevo", label: "Brevo" },
];
const PROVIDER_LABEL: Record<string, string> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p.label]),
);

function IntegrationsCard({
  destinations,
  onDestinations,
}: {
  destinations: QuizDestination[];
  onDestinations: (next: QuizDestination[]) => void;
}) {
  // List of connected integrations fetched from the API.
  const [integrations, setIntegrations] = useState<IntegrationRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Per-provider targets fetched after connect or on demand; keyed by integration id.
  const [targetMap, setTargetMap] = useState<Record<string, TargetRow[]>>({});

  // Connect form state: one provider can be in "connecting" mode at a time.
  // Storing the draft key only until the POST succeeds, then it is cleared.
  const [connectingProvider, setConnectingProvider] = useState<EspProvider | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Disconnect in-flight state; keyed by integration id.
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({});

  // Targets loading in-flight state; keyed by integration id.
  const [targetsLoading, setTargetsLoading] = useState<Record<string, boolean>>({});

  async function loadIntegrations() {
    setLoadError(null);
    try {
      const res = await fetch("/api/integrations");
      if (!res.ok) throw new Error("fetch_failed");
      const data = (await res.json()) as { integrations: IntegrationRow[] };
      setIntegrations(data.integrations);
    } catch {
      setLoadError("Could not load connections. Please try again.");
    }
  }

  async function loadTargets(integrationId: string) {
    if (targetMap[integrationId] !== undefined) return;
    setTargetsLoading((prev) => ({ ...prev, [integrationId]: true }));
    try {
      const res = await fetch(`/api/integrations/${integrationId}`);
      if (!res.ok) throw new Error("fetch_failed");
      const data = (await res.json()) as { targets: TargetRow[] };
      setTargetMap((prev) => ({ ...prev, [integrationId]: data.targets }));
    } catch {
      // Targets will remain undefined; the select will show an error hint.
      setTargetMap((prev) => ({ ...prev, [integrationId]: [] }));
    } finally {
      setTargetsLoading((prev) => ({ ...prev, [integrationId]: false }));
    }
  }

  // Load connections on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadIntegrations();
  }, []);

  // Load targets for any connected integration that does not have them cached yet.
  useEffect(() => {
    for (const integration of integrations ?? []) {
      if (targetMap[integration.id] === undefined && !targetsLoading[integration.id]) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadTargets(integration.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrations]);

  async function connect(provider: EspProvider) {
    setConnecting(true);
    setConnectError(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey: draftKey }),
      });
      const data = (await res.json()) as
        | { integration: IntegrationRow; targets: TargetRow[] }
        | { error: string };
      if (!res.ok) {
        setConnectError("error" in data ? data.error : "Could not connect");
        return;
      }
      if (!("integration" in data)) {
        setConnectError("Could not connect. Unexpected response.");
        return;
      }
      // Clear the key immediately after use; never retain it in state.
      setDraftKey("");
      setConnectingProvider(null);
      // Update integration list and cache targets returned by the POST.
      setIntegrations((prev) => {
        if (!prev) return [data.integration];
        const idx = prev.findIndex((i) => i.id === data.integration.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = data.integration;
          return updated;
        }
        return [...prev, data.integration];
      });
      setTargetMap((prev) => ({ ...prev, [data.integration.id]: data.targets }));
    } catch {
      setConnectError("Could not connect. Please try again.");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect(integrationId: string) {
    setDisconnecting((prev) => ({ ...prev, [integrationId]: true }));
    try {
      const res = await fetch(`/api/integrations/${integrationId}`, { method: "DELETE" });
      if (!res.ok) return;
      setIntegrations((prev) => (prev ? prev.filter((i) => i.id !== integrationId) : prev));
      setTargetMap((prev) => {
        const next = { ...prev };
        delete next[integrationId];
        return next;
      });
      // Remove destinations that referenced the deleted connection.
      onDestinations(destinations.filter((d) => d.integrationId !== integrationId));
    } catch {
      // Silent: the row persists, user can retry.
    } finally {
      setDisconnecting((prev) => ({ ...prev, [integrationId]: false }));
    }
  }

  function pickTarget(integration: IntegrationRow, targetId: string) {
    const targets = targetMap[integration.id] ?? [];
    const target = targets.find((t) => t.id === targetId);
    if (!target) return;
    // At most one destination per integration id.
    const filtered = destinations.filter((d) => d.integrationId !== integration.id);
    onDestinations([
      ...filtered,
      {
        integrationId: integration.id,
        provider: integration.provider as QuizDestination["provider"],
        targetId: target.id,
        targetName: target.name,
      },
    ]);
  }

  function removeDestination(integrationId: string) {
    onDestinations(destinations.filter((d) => d.integrationId !== integrationId));
  }

  const connectedProviders = new Set((integrations ?? []).map((i) => i.provider));

  return (
    <div className="rounded-2xl border border-[var(--hairline)] p-4">
      <p className="text-sm font-semibold">Email integrations</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Connect an email service provider and choose which list or form to add leads to.
      </p>

      {loadError && (
        <p className="mt-2 text-xs font-semibold text-rose-600">{loadError}</p>
      )}

      {/* Connected integrations */}
      {integrations && integrations.length > 0 && (
        <div className="mt-4 space-y-3">
          {integrations.map((integration) => {
            const dest = destinations.find((d) => d.integrationId === integration.id);
            const targets = targetMap[integration.id];
            const isTargetsLoading = targetsLoading[integration.id] ?? false;
            const isDisconnecting = disconnecting[integration.id] ?? false;

            return (
              <div
                key={integration.id}
                className="rounded-[10px] border border-[var(--hairline)] bg-[var(--e-surface-2)] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">
                      {PROVIDER_LABEL[integration.provider] ?? integration.provider}
                    </span>
                    {integration.status === "needs_reconnect" ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Needs reconnect
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Connected
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {integration.status === "needs_reconnect" && (
                      <button
                        type="button"
                        onClick={() => {
                          setConnectingProvider(integration.provider as EspProvider);
                          setDraftKey("");
                          setConnectError(null);
                        }}
                        className="text-[11px] font-semibold text-[var(--signal)] underline underline-offset-2"
                      >
                        Reconnect
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isDisconnecting}
                      onClick={() => void disconnect(integration.id)}
                      className="text-[11px] font-semibold text-[var(--muted)] underline underline-offset-2 transition-colors hover:text-rose-600 disabled:opacity-40"
                    >
                      {isDisconnecting ? "Removing..." : "Disconnect"}
                    </button>
                  </div>
                </div>

                {/* Target picker */}
                <div className="mt-2">
                  {isTargetsLoading ? (
                    <p className="text-[11px] text-[var(--muted)]">Loading lists...</p>
                  ) : targets && targets.length > 0 ? (
                    <select
                      value={dest?.targetId ?? ""}
                      onChange={(e) => pickTarget(integration, e.target.value)}
                      className="w-full rounded-full border border-[var(--hairline)] bg-white px-3 py-2 text-xs outline-none focus:border-[var(--signal)]"
                    >
                      <option value="">No list selected</option>
                      {targets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  ) : targets && targets.length === 0 ? (
                    <p className="text-[11px] text-[var(--muted)]">
                      No lists found. Create one in your ESP first.
                    </p>
                  ) : null}
                </div>

                {/* Active destination chip */}
                {dest && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--foreground)]">
                      {dest.targetName}
                      <button
                        type="button"
                        aria-label={`Remove ${dest.targetName}`}
                        onClick={() => removeDestination(integration.id)}
                        className="ml-0.5 text-[var(--muted)] transition-colors hover:text-rose-600"
                      >
                        &#x2715;
                      </button>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Connect form (shown when a provider button is clicked or reconnect is triggered) */}
      {connectingProvider && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold">
            {PROVIDER_LABEL[connectingProvider] ?? connectingProvider} API key
          </p>
          <input
            type="password"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder="Paste your API key"
            autoComplete="off"
            className="w-full rounded-full border border-[var(--hairline)] px-4 py-2.5 text-xs outline-none focus:border-[var(--signal)]"
          />
          {connectError && (
            <p className="text-[11px] font-semibold text-rose-600">{connectError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={connecting || draftKey.trim().length < 8}
              onClick={() => void connect(connectingProvider)}
              className="rounded-full bg-[var(--signal)] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--e-accent-bright)] disabled:opacity-40"
            >
              {connecting ? "Connecting..." : "Connect"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConnectingProvider(null);
                setDraftKey("");
                setConnectError(null);
              }}
              className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold text-[var(--e-text-2)] transition-colors hover:border-black/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Buttons to connect a provider that is not yet connected */}
      {!connectingProvider && (
        <div className="mt-4 flex flex-wrap gap-2">
          {PROVIDERS.filter((p) => !connectedProviders.has(p.id)).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setConnectingProvider(p.id);
                setDraftKey("");
                setConnectError(null);
              }}
              className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold text-[var(--e-text-2)] transition-colors hover:border-black/20 hover:text-[var(--foreground)]"
            >
              Connect {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Small clipboard button for a DNS record cell. Shows a brief check on success.
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      title="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable; no-op
        }
      }}
      className="mt-px shrink-0 text-[var(--muted)] transition-colors hover:text-[var(--signal)]"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

// Inline domain manager used inside the follow-up card when custom_domain mode is
// selected and the owner has Pro. Fetches account-level sending domain state on
// mount, lets the owner add / verify / remove the domain.
function SendingDomainCard() {
  const [domain, setDomain] = useState<SendingDomain | null>(null);
  // null = not yet loaded; "none" = loaded and no domain exists
  const [loadState, setLoadState] = useState<"loading" | "none" | "loaded" | "error">("loading");

  const [draftDomain, setDraftDomain] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // "idle" = no check running; "checking" = polling Resend; "timeout" = polled
  // the full window without verifying (DNS may still be propagating).
  const [verifyPhase, setVerifyPhase] = useState<"idle" | "checking" | "timeout">("idle");
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Poll the read-only status endpoint every 5s, for up to 3 minutes, after a
  // single trigger. Refs let us cancel cleanly on unmount / re-trigger.
  const POLL_INTERVAL_MS = 5000;
  const POLL_WINDOW_MS = 3 * 60 * 1000;
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCancelled = useRef(false);

  function stopPolling() {
    pollCancelled.current = true;
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  // Merge a status (and refreshed DNS records) into the displayed domain.
  function applyStatus(status: string, dnsRecords?: SendingDomain["dns_records"]) {
    setDomain((prev) =>
      prev
        ? { ...prev, status: status as SendingDomain["status"], dns_records: dnsRecords ?? prev.dns_records }
        : prev,
    );
  }

  // Read-only check (GET): syncs status + per-record DNS state, no re-trigger.
  async function checkStatusOnce(): Promise<string | null> {
    try {
      const res = await fetch("/api/sending-domain/verify");
      if (!res.ok) return null;
      const data = (await res.json()) as { status?: string; dnsRecords?: SendingDomain["dns_records"] };
      if (data.status) applyStatus(data.status, data.dnsRecords);
      return data.status ?? null;
    } catch {
      return null;
    }
  }

  async function loadDomain() {
    setLoadState("loading");
    setRemoveError(null);
    try {
      const res = await fetch("/api/sending-domain");
      if (!res.ok) throw new Error("fetch_failed");
      const data = (await res.json()) as { sendingDomain: SendingDomain | null };
      if (data.sendingDomain) {
        setDomain(data.sendingDomain);
        setLoadState("loaded");
        // Self-heal: a row can read "pending" after Resend has already verified
        // in the background. One silent read-only check on load reconciles it
        // without the owner having to press Verify.
        if (data.sendingDomain.status === "pending") void checkStatusOnce();
      } else {
        setDomain(null);
        setLoadState("none");
      }
    } catch {
      setLoadState("error");
    }
  }

  // Load on mount; stop any poll on unmount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDomain();
    return () => stopPolling();
  }, []);

  async function addDomain() {
    const trimmed = draftDomain.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/sending-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: trimmed }),
      });
      const data = (await res.json()) as { sendingDomain?: SendingDomain; error?: string; reason?: string };
      if (!res.ok) {
        if (res.status === 403) {
          setAddError("A Pro plan is required to use a custom sending domain.");
        } else {
          setAddError(data.error ?? "Could not add domain. Please check the format and try again.");
        }
        return;
      }
      if (data.sendingDomain) {
        setDomain(data.sendingDomain);
        setLoadState("loaded");
        setDraftDomain("");
      }
    } catch {
      setAddError("Could not add domain. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  // Trigger verification ONCE, then poll the read-only check until it verifies,
  // fails, or the window elapses. No further clicks needed.
  async function verifyDomain() {
    stopPolling();
    pollCancelled.current = false;
    setVerifyError(null);
    setVerifyPhase("checking");

    // 1. Trigger once.
    let status: string | null = null;
    try {
      const res = await fetch("/api/sending-domain/verify", { method: "POST" });
      const data = (await res.json()) as { status?: string; dnsRecords?: SendingDomain["dns_records"]; error?: string };
      if (!res.ok) {
        setVerifyError(data.error ?? "Verification failed. Please try again.");
        setVerifyPhase("idle");
        return;
      }
      if (data.status) applyStatus(data.status, data.dnsRecords);
      status = data.status ?? null;
    } catch {
      setVerifyError("Could not verify. Please try again.");
      setVerifyPhase("idle");
      return;
    }
    if (status === "verified") {
      setVerifyPhase("idle");
      return;
    }

    // 2. Poll read-only until resolved or the window elapses.
    const deadline = Date.now() + POLL_WINDOW_MS;
    const tick = async () => {
      if (pollCancelled.current) return;
      const s = await checkStatusOnce();
      if (pollCancelled.current) return;
      if (s === "verified") {
        setVerifyPhase("idle");
        return;
      }
      if (s === "failed") {
        setVerifyError("DNS check failed. Confirm the records below match exactly, then verify again.");
        setVerifyPhase("idle");
        return;
      }
      if (Date.now() >= deadline) {
        setVerifyPhase("timeout");
        return;
      }
      pollTimer.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };
    pollTimer.current = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  }

  async function removeDomain() {
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch("/api/sending-domain", { method: "DELETE" });
      if (!res.ok) {
        setRemoveError("Could not remove domain. Please try again.");
        return;
      }
      setDomain(null);
      setLoadState("none");
    } catch {
      setRemoveError("Could not remove domain. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  if (loadState === "loading") {
    return <p className="text-[11px] text-[var(--muted)]">Loading...</p>;
  }

  if (loadState === "error") {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-rose-600">
          Could not load domain settings.
        </p>
        <button
          type="button"
          onClick={() => void loadDomain()}
          className="text-[11px] font-semibold text-[var(--signal)] underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  // No domain yet: show add form.
  if (loadState === "none") {
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-[var(--muted)]">
          Enter the domain you want to send from. You will need to add DNS records after.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={draftDomain}
            onChange={(e) => setDraftDomain(e.target.value)}
            placeholder="mail.yourdomain.com"
            className="flex-1 rounded-full border border-[var(--hairline)] px-4 py-2 text-xs outline-none focus:border-[var(--signal)]"
          />
          <button
            type="button"
            disabled={adding || draftDomain.trim().length < 3}
            onClick={() => void addDomain()}
            className="rounded-full bg-[var(--signal)] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--e-accent-bright)] disabled:opacity-40"
          >
            {adding ? "Adding..." : "Add domain"}
          </button>
        </div>
        {addError && (
          <p className="text-[11px] font-semibold text-rose-600">{addError}</p>
        )}
      </div>
    );
  }

  // Domain exists: show status, DNS records table, and actions.
  const rec = domain!;

  // Per-record status, kept in lockstep with the domain-level label:
  // - while checking, reflect Resend's live per-record state;
  // - once the whole domain is verified, every record is OK;
  // - otherwise (before a check, or after a timed-out / failed attempt) show
  //   "Not verified" rather than leaving stale per-record states behind.
  function renderRecordStatus(recordStatus: string) {
    if (verifyPhase === "checking") {
      if (recordStatus === "verified") return <span className="text-emerald-600">OK</span>;
      if (recordStatus === "failed") return <span className="text-rose-600">Failed</span>;
      return <span className="text-amber-600">Checking...</span>;
    }
    if (rec.status === "verified") return <span className="text-emerald-600">OK</span>;
    return <span className="text-amber-600">Not verified</span>;
  }

  return (
    <div className="space-y-3">
      {/* Domain header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-xs font-semibold">{rec.domain}</span>
          {rec.status === "verified" ? (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              Verified
            </span>
          ) : verifyPhase === "checking" ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Checking...
            </span>
          ) : rec.status === "failed" ? (
            <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
              Failed
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Not verified
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rec.status !== "verified" && (
            <button
              type="button"
              disabled={verifyPhase === "checking"}
              onClick={() => void verifyDomain()}
              className="text-[11px] font-semibold text-[var(--signal)] underline underline-offset-2 disabled:opacity-40"
            >
              {verifyPhase === "checking" ? "Verifying..." : "Verify"}
            </button>
          )}
          <button
            type="button"
            disabled={removing}
            onClick={() => void removeDomain()}
            className="text-[11px] font-semibold text-[var(--muted)] underline underline-offset-2 transition-colors hover:text-rose-600 disabled:opacity-40"
          >
            {removing ? "Removing..." : "Remove"}
          </button>
        </div>
      </div>

      {/* Progress + status messages */}
      {verifyPhase === "checking" && (
        <p className="text-[11px] text-[var(--muted)]">
          Checking your DNS records. This can take a few minutes. You can leave this page; we will re-check when you come back.
        </p>
      )}
      {verifyPhase === "timeout" && (
        <p className="text-[11px] font-semibold text-amber-700">
          Not verified yet. DNS changes can take up to a few hours to spread. Come back later and verify again.
        </p>
      )}
      {verifyError && (
        <p className="text-[11px] font-semibold text-rose-600">{verifyError}</p>
      )}
      {removeError && (
        <p className="text-[11px] font-semibold text-rose-600">{removeError}</p>
      )}

      {/* DNS records table */}
      {rec.dns_records.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-[var(--muted)]">
            Add these DNS records at your registrar, then click Verify:
          </p>
          <div className="overflow-x-auto rounded-[10px] border border-[var(--hairline)]">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-[var(--hairline)] bg-[var(--e-surface-2)]">
                  <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Name</th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Value</th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Priority</th>
                  <th className="px-3 py-2 text-left font-semibold text-[var(--muted)]">Status</th>
                </tr>
              </thead>
              <tbody>
                {rec.dns_records.map((r, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--hairline)] last:border-0"
                  >
                    <td className="px-3 py-2 font-mono text-[var(--foreground)]">{r.type}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="font-mono text-[var(--foreground)] break-all">{r.name}</span>
                        <CopyButton value={r.name} label="name" />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="font-mono text-[var(--foreground)] break-all">{r.value}</span>
                        <CopyButton value={r.value} label="value" />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {r.priority != null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[var(--foreground)]">{r.priority}</span>
                          <CopyButton value={String(r.priority)} label="priority" />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{renderRecordStatus(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-[var(--muted)]">
            Name values are relative to your root domain. Most registrars add the domain for you, so paste the name as shown.
          </p>
        </div>
      )}
    </div>
  );
}

function FollowUpCard({
  followUp,
  onFollowUp,
  quizTitle,
  outcomes,
  hasPro,
}: {
  followUp: FollowUpConfig;
  onFollowUp: (next: FollowUpConfig) => void;
  quizTitle: string;
  outcomes: { id: string; name: string; description: string; hasCta: boolean }[];
  hasPro: boolean;
}) {
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  function toggleEnabled(enabled: boolean) {
    onFollowUp({ ...followUp, enabled });
  }

  function updateOutcome(outcomeId: string, field: "subject" | "body", value: string) {
    const existing = followUp.outcomes[outcomeId] ?? { subject: "", body: "" };
    onFollowUp({
      ...followUp,
      outcomes: {
        ...followUp.outcomes,
        [outcomeId]: { ...existing, [field]: value },
      },
    });
  }

  async function draftOutcome(outcome: { id: string; name: string; description: string; hasCta: boolean }) {
    setDraftingId(outcome.id);
    setDraftError(null);
    try {
      const res = await fetch("/api/follow-up/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizTitle,
          outcomeName: outcome.name,
          outcomeDescription: outcome.description,
          // Phase 1 has no owner display-name field, so the brand (the quiz title)
          // stands in for the sender name. This matches the runtime send, where the
          // {{owner_name}} token and the email From name also resolve to the title.
          // A dedicated owner display name is a Phase 2 enhancement.
          ownerName: quizTitle,
          hasCta: outcome.hasCta,
        }),
      });
      if (!res.ok) throw new Error("draft_failed");
      const data = (await res.json()) as { subject?: string; body?: string };
      if (typeof data.subject === "string" || typeof data.body === "string") {
        const existing = followUp.outcomes[outcome.id] ?? { subject: "", body: "" };
        onFollowUp({
          ...followUp,
          outcomes: {
            ...followUp.outcomes,
            [outcome.id]: {
              subject: typeof data.subject === "string" ? data.subject : existing.subject,
              body: typeof data.body === "string" ? data.body : existing.body,
            },
          },
        });
      }
    } catch {
      setDraftError("Could not draft. Please try again.");
    } finally {
      setDraftingId(null);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--hairline)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Follow-up email</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Send each lead a personalised email based on their result. One template per outcome.
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={followUp.enabled}
            onChange={(e) => toggleEnabled(e.target.checked)}
            className="h-4 w-4 accent-[var(--signal)]"
          />
          Enable
        </label>
      </div>

      {followUp.enabled && (
        <div className="mt-4 space-y-3 border-t border-[var(--hairline)] pt-4">
          <p className="text-xs font-semibold">Send from</p>

          {/* Treeflow subdomain option */}
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name="sender-mode"
              checked={followUp.sender.mode !== "custom_domain"}
              onChange={() =>
                onFollowUp({ ...followUp, sender: { mode: "subdomain" } })
              }
              className="mt-0.5 accent-[var(--signal)]"
            />
            <div>
              <span className="text-xs font-semibold">Treeflow subdomain</span>
              <p className="text-[11px] text-[var(--muted)]">
                Sent from a shared Treeflow address. No setup required.
              </p>
            </div>
          </label>

          {/* Custom domain option */}
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name="sender-mode"
              checked={followUp.sender.mode === "custom_domain"}
              onChange={() =>
                onFollowUp({ ...followUp, sender: { mode: "custom_domain" } })
              }
              className="mt-0.5 accent-[var(--signal)]"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">My own domain</span>
                {!hasPro && (
                  <span className="rounded-full bg-[var(--e-surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                    Pro
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--muted)]">
                Send from your own domain. Requires DNS setup.
              </p>
            </div>
          </label>

          {/* Domain manager - only when custom_domain is selected */}
          {followUp.sender.mode === "custom_domain" && (
            !hasPro ? (
              <div className="ml-5 rounded-[10px] border border-[var(--hairline)] bg-[var(--e-surface-2)] p-3">
                <p className="text-xs text-[var(--muted)]">
                  Sending from your own domain is a Pro feature.{" "}
                  <Link
                    href="/pricing"
                    className="font-semibold text-[var(--signal)] underline underline-offset-2 hover:text-[var(--e-accent-bright)]"
                  >
                    Upgrade to Pro
                  </Link>
                </p>
              </div>
            ) : (
              <div className="ml-5">
                <SendingDomainCard />
              </div>
            )
          )}
        </div>
      )}

      {followUp.enabled && outcomes.length > 0 && (
        <div className="mt-4 space-y-5">
          <p className="text-[11px] text-[var(--muted)]">
            Available tokens: <code className="font-mono">{"{{name}}"}</code>,{" "}
            <code className="font-mono">{"{{outcome}}"}</code>,{" "}
            <code className="font-mono">{"{{cta_link}}"}</code>,{" "}
            <code className="font-mono">{"{{quiz_title}}"}</code>,{" "}
            <code className="font-mono">{"{{owner_name}}"}</code>
          </p>
          {draftError && (
            <p className="text-xs font-semibold text-rose-600">{draftError}</p>
          )}
          {outcomes.map((outcome) => {
            const tpl = followUp.outcomes[outcome.id] ?? { subject: "", body: "" };
            const isDrafting = draftingId === outcome.id;
            return (
              <div key={outcome.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-[var(--foreground)]">{outcome.name}</p>
                  <button
                    type="button"
                    disabled={isDrafting || draftingId !== null}
                    onClick={() => void draftOutcome(outcome)}
                    className="shrink-0 rounded-full border border-[var(--hairline)] px-3 py-1 text-[11px] font-semibold text-[var(--e-text-2)] transition-colors hover:border-black/20 disabled:opacity-40"
                  >
                    {isDrafting ? "Drafting..." : "AI draft"}
                  </button>
                </div>
                {!outcome.hasCta && (
                  <p className="text-[11px] text-amber-600">
                    This outcome has no CTA link, so {"{{cta_link}}"} will be empty. Add a CTA link to
                    this outcome (in its outcome settings) to use it.
                  </p>
                )}
                <input
                  type="text"
                  value={tpl.subject}
                  onChange={(e) => updateOutcome(outcome.id, "subject", e.target.value)}
                  placeholder="Subject line"
                  className="w-full rounded-full border border-[var(--hairline)] px-4 py-2 text-xs outline-none focus:border-[var(--signal)]"
                />
                <textarea
                  value={tpl.body}
                  onChange={(e) => updateOutcome(outcome.id, "body", e.target.value)}
                  placeholder="Email body"
                  rows={4}
                  className="w-full resize-none rounded-[10px] border border-[var(--hairline)] px-4 py-2 text-xs outline-none focus:border-[var(--signal)]"
                />
              </div>
            );
          })}
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
