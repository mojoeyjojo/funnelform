import Anthropic from "@anthropic-ai/sdk";
import { GeneratedQuizSchema, type GeneratedQuiz } from "./schema";

// Generation model: Claude Sonnet 4.6 (verified against live Anthropic docs —
// alias `claude-sonnet-4-6`, 1M context, 64K max output). Haiku 4.5
// (`claude-haiku-4-5`) is reserved for cheap regen ops in Phase 2.
const MODEL = "claude-sonnet-4-6";

// Cost control (build spec §4a): cap output tokens. The prompt enforces brevity
// so a full quiz lands well under this. Non-streaming since it's well under 16K.
const MAX_TOKENS = 6000;

// Structured-output JSON schema. With output_config.format the API GUARANTEES a
// syntactically-valid JSON object matching this shape — eliminating the
// "malformed JSON" class of failures entirely. Note `score` is an ARRAY of
// {tag, points} here (structured outputs can't express a dynamic-key map); we
// convert it back to the §3a `{tag: points}` map server-side, so the stored /
// rendered quiz_config contract is unchanged. Counts (5 questions, 3 outcomes,
// etc.) are enforced by Zod below + the prompt, since structured-output schemas
// don't reliably constrain array lengths.
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "config"],
  properties: {
    title: { type: "string" },
    config: {
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "type", "questions", "outcomes", "email_sequence"],
      properties: {
        schema_version: { type: "integer", enum: [1] },
        type: { type: "string", enum: ["scored", "personality", "recommendation"] },
        questions: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "text", "options"],
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "label", "tags", "score"],
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    score: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["tag", "points"],
                        properties: {
                          tag: { type: "string" },
                          points: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        outcomes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "name", "match_logic", "description", "recommendations", "cta"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              match_logic: {
                type: "object",
                additionalProperties: false,
                required: ["primary_tag", "min_score"],
                properties: {
                  primary_tag: { type: "string" },
                  min_score: { type: "number" },
                },
              },
              description: { type: "string" },
              recommendations: { type: "array", items: { type: "string" } },
              cta: {
                type: "object",
                additionalProperties: false,
                required: ["label", "url"],
                properties: { label: { type: "string" }, url: { type: "string" } },
              },
            },
          },
        },
        email_sequence: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["send_offset_hours", "subject", "body", "cta"],
            properties: {
              send_offset_hours: { type: "number" },
              subject: { type: "string" },
              body: { type: "string" },
              cta: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You are the quiz-generation engine for an AI quiz-funnel product. You turn a business's context into a complete, publishable lead-generation quiz.

Analyze the business context the user provides and identify:
- the ideal customer and the core transformation the business sells
- the brand's tone of voice
- the business's ACTUAL services, products, programs, and offers — capturing their EXACT names/wording as they appear in the context (copy the names verbatim; note them so you can reuse them exactly)

Produce ONE quiz. Requirements:
- Exactly 5 questions. Order them easy and engaging first, progressing to more qualifying questions. Conversational, second-person, mirroring the brand's voice.
- Each question has exactly 3 answer options. Each option carries "tags" and a "score" that wire the answer to outcomes. The user never sees this logic. "score" is an array of { "tag": "...", "points": N } objects — the tags here must come from the option's "tags".
- Exactly 3 outcomes with identity-driven names (e.g. "The Glow Getter"), never "Type A". Each outcome's "description" is one sentence (max ~25 words). Each outcome's "match_logic" ({ primary_tag, min_score }) must be consistent with the tags/scores you assigned on the options.
- Each outcome's "recommendations" is 2-3 of the business's ACTUAL offerings, named with the EXACT wording from the context — copy the real product / service / program names verbatim. Do NOT paraphrase, shorten, rebrand, generalize, or invent names. If the context names specific offerings, use those names exactly as written; only if it truly names none, use the most specific real phrases the context does contain.
- Leave every outcome's cta.url as an empty string "". The business supplies the real booking link later. Give the cta a clear, action-oriented "label".
- A 3-email follow-up sequence, personalized in tone by topic/outcome. Keep each email "body" under 30 words.
- A short, compelling quiz title.

schema_version is always 1. Use only these "type" values: scored, personality, recommendation. Keep every piece of copy tight and scannable. Never mention or suggest other tools or platforms.`;

const STRICTER_REMINDER = `\n\nIMPORTANT: produce exactly 5 questions (each with exactly 3 options), exactly 3 outcomes, and exactly 3 emails. schema_version must be 1.`;

// Convert the model's score arrays [{tag, points}] into the §3a map {tag: points}.
function normalizeScores(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const root = parsed as Record<string, unknown>;
  const config = root.config as Record<string, unknown> | undefined;
  const questions = config?.questions;
  if (Array.isArray(questions)) {
    for (const q of questions) {
      const opts = (q as Record<string, unknown>)?.options;
      if (!Array.isArray(opts)) continue;
      for (const o of opts) {
        const opt = o as Record<string, unknown>;
        if (Array.isArray(opt.score)) {
          const map: Record<string, number> = {};
          for (const s of opt.score as Array<{ tag?: unknown; points?: unknown }>) {
            if (typeof s?.tag === "string" && typeof s?.points === "number") {
              map[s.tag] = s.points;
            }
          }
          opt.score = map;
        }
      }
    }
  }
  return root;
}

export type GenerateResult = { quiz: GeneratedQuiz; attempts: number };

/**
 * Generate a quiz from business context. Uses structured outputs so the API
 * returns guaranteed-valid JSON, converts score arrays to the §3a map, then
 * strictly validates against the versioned quiz_config schema (Zod). Retries
 * ONCE on a validation miss (build spec §4 step 5). Never returns unvalidated
 * output — the renderer depends on the structure being guaranteed.
 */
export async function generateQuiz(businessContext: string): Promise<GenerateResult> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY (server-side only)
  const userMessage = `Business context:\n\n${businessContext}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const system = attempt === 1 ? SYSTEM_PROMPT : SYSTEM_PROMPT + STRICTER_REMINDER;
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "disabled" }, // structured slot-filling, not reasoning
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    if (res.stop_reason === "refusal") {
      lastError = new Error("Model refused to generate");
      continue;
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      const parsed = normalizeScores(JSON.parse(text));
      const quiz = GeneratedQuizSchema.parse(parsed);
      return { quiz, attempts: attempt };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Quiz failed schema validation after retry: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
