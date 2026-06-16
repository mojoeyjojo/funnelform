"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OutputRating, QuizDestination } from "@/lib/types";
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
  const [connectingProvider, setConnectingProvider] = useState<"kit" | "mailchimp" | null>(null);
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

  async function connect(provider: "kit" | "mailchimp") {
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

  const providerLabel: Record<string, string> = { kit: "Kit", mailchimp: "Mailchimp" };

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
                      {providerLabel[integration.provider] ?? integration.provider}
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
                          setConnectingProvider(integration.provider as "kit" | "mailchimp");
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
            {connectingProvider === "kit" ? "Kit" : "Mailchimp"} API key
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
          {(["kit", "mailchimp"] as const)
            .filter((p) => !connectedProviders.has(p))
            .map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setConnectingProvider(p);
                  setDraftKey("");
                  setConnectError(null);
                }}
                className="rounded-full border border-[var(--hairline)] px-4 py-2 text-xs font-semibold text-[var(--e-text-2)] transition-colors hover:border-black/20 hover:text-[var(--foreground)]"
              >
                {p === "kit" ? "Connect Kit" : "Connect Mailchimp"}
              </button>
            ))}
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
}: {
  followUp: FollowUpConfig;
  onFollowUp: (next: FollowUpConfig) => void;
  quizTitle: string;
  outcomes: { id: string; name: string; description: string; hasCta: boolean }[];
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
