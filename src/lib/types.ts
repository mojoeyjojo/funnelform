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
  // Publish flow (2B) — completes the Claim 2 create-to-publish funnel.
  | "publish_attempted"
  | "publish_blocked_validation"
  | "published"
  // Delivery (Phase 3) — owner-notification email fired on a captured lead.
  | "owner_notified"
  // Cost/abuse protection: a generate request was refused by the rate limiter.
  | "rate_limited";

// quiz_events.event_type — the published quiz's VISITOR journey (build spec §3).
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

// Stage names emitted by the streaming /api/generate route. These reflect REAL
// pipeline phases (not a fake timer): `reading` = Jina fetch, `writing` = Claude
// generation + Zod validation/retry, `validating` = final assembly before return.
export type GenerateStage = "reading" | "writing" | "validating";

// NDJSON events streamed from /api/generate.
export type GenerateStreamEvent =
  | { type: "stage"; stage: GenerateStage }
  | { type: "thin_site" }
  | { type: "done"; title: string; config: unknown }
  | { type: "error"; message: string };
