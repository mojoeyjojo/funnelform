import { z } from "zod";

// =============================================================================
// quiz_config — THE versioned contract (build spec §3a).
//
// The LLM generates *content*; this schema fixes the *structure*. Every
// generated quiz MUST validate against this before it is stored or rendered.
// `schema_version` is mandatory so the player can pick a renderer by version and
// never break already-published quizzes when the schema evolves.
// =============================================================================

export const SCHEMA_VERSION = 1 as const;

const OptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  // tags wire the answer to outcomes; the user never sees this logic.
  tags: z.array(z.string().min(1)).min(1),
  // score map: tag -> points contributed by choosing this option.
  score: z.record(z.string(), z.number()),
});

const QuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  options: z.array(OptionSchema).min(2).max(6),
});

const OutcomeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  match_logic: z.object({
    primary_tag: z.string().min(1),
    min_score: z.number(),
  }),
  description: z.string().min(1),
  recommendations: z.array(z.string().min(1)).min(1),
  cta: z.object({
    label: z.string().min(1),
    // url is intentionally allowed empty: the AI leaves the booking link blank
    // by design (it can't know it). Publish validation (Phase 2) requires it.
    url: z.string(),
  }),
});

const EmailSchema = z.object({
  send_offset_hours: z.number(),
  subject: z.string().min(1),
  body: z.string().min(1),
  cta: z.string(),
});

export const QuizConfigSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  type: z.enum(["scored", "personality", "recommendation"]),
  questions: z.array(QuestionSchema).min(5).max(7),
  outcomes: z.array(OutcomeSchema).min(3).max(4),
  email_sequence: z.array(EmailSchema).min(3).max(3),
});

// The generation envelope. In the real data model `title` maps to the
// `quizzes.title` column and `config` to `quizzes.config` (jsonb). Keeping them
// split here preserves quiz_config (§3a) as the pure, versioned contract instead
// of polluting it with a title field. Phase 1 doesn't persist a quizzes row
// (no auth yet), so the whole envelope is just returned to the client to render.
export const GeneratedQuizSchema = z.object({
  title: z.string().min(1),
  config: QuizConfigSchema,
});

export type QuizConfig = z.infer<typeof QuizConfigSchema>;
export type GeneratedQuiz = z.infer<typeof GeneratedQuizSchema>;
