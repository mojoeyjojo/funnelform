// Shared types for the Phase 1 instrumentation (builder_events) and pipeline.

// builder_events.event_type values relevant to the Phase 1 generate flow.
// Full set lives in the build spec §3; Phase 1 emits the generate + first-view
// + early-edit subset. The rest land with the editor/publish flow in Phase 2.
export type BuilderEventType =
  | "generate_started"
  | "generate_succeeded"
  | "generate_failed"
  | "thin_site_fallback_shown"
  | "first_output_viewed"
  | "output_rating"
  | "field_edited"
  // Publish flow (2B): completes the Claim 2 create-to-publish funnel.
  | "publish_attempted"
  | "publish_blocked_validation"
  | "published"
  // Delivery (Phase 3): owner-notification email fired on a captured lead.
  | "owner_notified"
  // Cost/abuse protection: a generate request was refused by the rate limiter.
  | "rate_limited"
  // Monetization (§5.9): server-side paywall instrumentation.
  | "paywall_hit" // metadata: { trigger: PaywallTrigger }
  | "upgrade_clicked" // metadata: { trigger?, interval: "monthly" | "yearly" }
  | "plan_changed" // metadata: { from, to, stripe_event }, written by the webhook only
  | "trial_reminder_sent"; // metadata: { subscription_id, trial_end }, dedupes the cron email

// Where a free user ran into the paywall (drives upgrade-page messaging later).
export type PaywallTrigger = "second_quiz" | "branding" | "analytics" | "lead_cap" | "custom_domain";

// quiz_events.event_type: the published quiz's VISITOR journey (build spec §3).
export type QuizEventType =
  | "view"
  | "start"
  | "question_answered"
  | "completed"
  | "lead_captured";

// Events the CLIENT is allowed to record (server records the generate_* ones).
export const CLIENT_EVENT_TYPES: BuilderEventType[] = [
  "first_output_viewed",
  "output_rating",
  "field_edited",
];

export type OutputRating = "love_it" | "not_quite";

// The goal the user picks BEFORE generation begins. Collected up front so the
// scrape-extraction step knows what to surface and the generation prompt knows
// what to optimise for (booking CTAs, a single offer, list growth, or buyer
// qualification). One of exactly these four strings.
export type Goal =
  | "book_consultations"
  | "promote_offer"
  | "grow_list"
  | "qualify_buyers";

export const GOAL_VALUES: readonly Goal[] = [
  "book_consultations",
  "promote_offer",
  "grow_list",
  "qualify_buyers",
];

export function isGoal(value: unknown): value is Goal {
  return typeof value === "string" && (GOAL_VALUES as readonly string[]).includes(value);
}

// Structured facts surfaced from a scraped site for Flow A's extraction display,
// BEFORE generation. Produced by a cheap Haiku pass over the Jina markdown,
// filtered by the chosen goal. `thin` mirrors the generate pipeline's thin-site
// branch so the client can route the user into describing their business instead.
export type ExtractResult =
  | { thin: true }
  | {
      thin?: false;
      services: string[];
      audience: string;
      tone: string;
      goalMatch: { label: string; value: string };
      // The scraped markdown, handed back so generation can reuse it instead of
      // re-fetching through Jina (keeps the generate step inside its time budget).
      siteContent?: string;
    };

// Stage names emitted by the streaming /api/generate route. These reflect REAL
// pipeline phases (not a fake timer): `reading` = Jina fetch, `writing` = Claude
// generation + Zod validation/retry, `validating` = final assembly before return.
export type GenerateStage = "reading" | "writing" | "validating";

// NDJSON events streamed from /api/generate. `code` lets the client branch on
// WHY it failed (rate_limited drives the signup funnel) without string-matching.
export type GenerateStreamEvent =
  | { type: "stage"; stage: GenerateStage }
  | { type: "thin_site" }
  | { type: "done"; title: string; config: unknown }
  | { type: "error"; message: string; code?: "rate_limited" };

// Outbox delivery (see supabase/migrations/0008_delivery_jobs.sql).
export type DeliveryJobKind = "follow_up_email" | "owner_notify" | "webhook" | "esp_push";
export type DeliveryJobStatus = "pending" | "done" | "failed" | "dead";

export interface DeliveryJob {
  id: string;
  lead_id: string;
  owner_id: string;
  kind: DeliveryJobKind;
  target: string | null;
  payload: Record<string, unknown>;
  status: DeliveryJobStatus;
  attempts: number;
  max_attempts: number;
  send_after: string;
  last_error: string | null;
}

// ESP integrations (see supabase/migrations/0010_integrations.sql).
export type EspProvider = "kit" | "mailchimp" | "mailerlite" | "brevo";

export interface Integration {
  id: string;
  owner_id: string;
  provider: EspProvider;
  status: "active" | "needs_reconnect";
  last_error: string | null;
}

// Per-quiz: push captured leads to this connection's target list/form. Stored in
// the quiz delivery jsonb as `destinations: QuizDestination[]`.
export interface QuizDestination {
  integrationId: string;
  provider: EspProvider;
  targetId: string;
  targetName: string;
}

// Custom sending domain for follow-up email (see 0013_sending_domains.sql).
export interface SendingDomain {
  id: string;
  domain: string;
  from_local: string;
  status: "pending" | "verified" | "failed";
  dns_records: { record: string; name: string; type: string; value: string; status: string }[];
}
