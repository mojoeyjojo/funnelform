import Anthropic from "@anthropic-ai/sdk";
import { GeneratedQuizSchema, type GeneratedQuiz } from "./schema";
import type { Goal } from "./types";

// Generation model: Claude Sonnet 4.6 (verified against live Anthropic docs —
// alias `claude-sonnet-4-6`, 1M context, 64K max output). Haiku 4.5
// (`claude-haiku-4-5`) handles the cheap pre-generation site extraction.
const MODEL = "claude-sonnet-4-6";
const EXTRACT_MODEL = "claude-haiku-4-5";

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

// The user's chosen goal, collected before generation, steers what the quiz
// optimises for. Appended to the system prompt so the model weights outcomes,
// CTAs, and questions toward that goal without changing the output contract.
const GOAL_DIRECTIVES: Record<Goal, string> = {
  book_consultations:
    "PRIMARY GOAL — book more consultations. Weight the outcomes and their CTAs toward booking a call or consultation: every outcome's cta.label should drive toward scheduling (e.g. \"Book your consultation\"), and lead with consultation- or scheduling-related offerings from the context.",
  promote_offer:
    "PRIMARY GOAL — promote one core offer. Orient the outcomes and their recommendations around the business's single most important offer; CTAs should move the reader toward that specific offer rather than browsing options.",
  grow_list:
    "PRIMARY GOAL — grow the email list. Make every outcome reinforce the value of the free result and the follow-up email sequence; CTA labels should lean toward getting the full results or plan by email. Write the 3-email sequence as a strong reason to opt in.",
  qualify_buyers:
    "PRIMARY GOAL — qualify serious buyers. Work intent, timeline, and budget signals into the questions so low-intent takers self-select out gracefully; outcomes should separate ready-to-buy from early-stage, and CTAs should match buying readiness.",
};

// What the extraction pass should hunt for on the page, per goal — drives the
// "matched to your goal" row in Flow A's extraction display.
const EXTRACT_GOAL_FOCUS: Record<Goal, string> = {
  book_consultations: "anything about booking, consultations, scheduling, or discovery calls",
  promote_offer: "the single most important offer, flagship product, or signature service",
  grow_list: "lead magnets, free guides, newsletters, or other opt-in offers",
  qualify_buyers: "pricing, packages, tiers, or other signals of who is a serious buyer",
};

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
export async function generateQuiz(
  businessContext: string,
  goal?: Goal,
): Promise<GenerateResult> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY (server-side only)
  const userMessage = `Business context:\n\n${businessContext}`;
  const goalLine = goal ? `\n\n${GOAL_DIRECTIVES[goal]}` : "";

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const system = (attempt === 1 ? SYSTEM_PROMPT : SYSTEM_PROMPT + STRICTER_REMINDER) + goalLine;
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

// Structured-output schema for the pre-generation extraction pass. Small and
// fast; the goal-relevant `goalMatch` powers the "matched to your goal" callout.
const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["services", "audience", "tone", "goalMatch"],
  properties: {
    services: { type: "array", items: { type: "string" } },
    audience: { type: "string" },
    tone: { type: "string" },
    goalMatch: {
      type: "object",
      additionalProperties: false,
      required: ["label", "value"],
      properties: { label: { type: "string" }, value: { type: "string" } },
    },
  },
} as const;

// What Flow A's extraction display gets: the non-thin shape of ExtractResult,
// minus the `thin`/`siteContent` plumbing the route adds.
export type SiteFacts = {
  services: string[];
  audience: string;
  tone: string;
  goalMatch: { label: string; value: string };
};

/**
 * Read scraped site markdown and pull out a few concrete, goal-relevant facts
 * for Flow A's extraction display. A cheap Haiku pass — it confirms to the user
 * what we saw before generation, and the same markdown is reused for the
 * generation call so we never scrape twice. Never invents: faithful to the page.
 */
export async function extractSiteFacts(markdown: string, goal: Goal): Promise<SiteFacts> {
  const client = new Anthropic();
  const system = `You read a business's scraped website and pull out a few concrete facts for a quiz-building tool. Be strictly faithful to the page — never invent. Use the site's own wording for any service or product names.
- services: 2 to 4 of the business's ACTUAL named services, products, or programs, copied verbatim from the page.
- audience: one short phrase naming who the business serves.
- tone: 2 to 4 words describing the brand's voice (e.g. "warm and clinical").
- goalMatch: the single most relevant thing on the page for the user's goal. "label" is a 2-4 word category; "value" is the specific thing found, or "Nothing obvious on the page" if absent. For this user, focus on ${EXTRACT_GOAL_FOCUS[goal]}.`;

  const res = await client.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 700,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
    system,
    messages: [{ role: "user", content: `Scraped site content:\n\n${markdown.slice(0, 8000)}` }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = JSON.parse(text) as {
    services?: unknown;
    audience?: unknown;
    tone?: unknown;
    goalMatch?: { label?: unknown; value?: unknown };
  };
  return {
    services: Array.isArray(parsed.services)
      ? parsed.services.filter((s): s is string => typeof s === "string").slice(0, 4)
      : [],
    audience: typeof parsed.audience === "string" ? parsed.audience : "",
    tone: typeof parsed.tone === "string" ? parsed.tone : "",
    goalMatch: {
      label:
        typeof parsed.goalMatch?.label === "string" ? parsed.goalMatch.label : "Matched to your goal",
      value: typeof parsed.goalMatch?.value === "string" ? parsed.goalMatch.value : "",
    },
  };
}

// =============================================================================
// Per-outcome follow-up email drafter. A cheap Haiku call that produces a short,
// friendly email (subject + body) for one quiz outcome. The caller stores it in
// the delivery jsonb alongside the WhatsApp and webhook fields.

const FOLLOW_UP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
} as const;

/**
 * Draft a short follow-up email for one quiz outcome. Uses the Haiku model with
 * structured outputs so the result is always a valid JSON object with subject +
 * body. Tokens {{name}}, {{quiz_title}}, {{owner_name}}, and {{outcome}} are
 * encouraged where natural. {{cta_link}} is only used when hasCta is true.
 * Under 150 words. No em dashes.
 */
export async function draftFollowUpEmail(input: {
  quizTitle: string;
  outcomeName: string;
  outcomeDescription: string;
  ownerName: string;
  hasCta: boolean;
}): Promise<{ subject: string; body: string }> {
  const client = new Anthropic();
  const ctaInstruction = input.hasCta
    ? "- Use {{cta_link}} as the offer or booking call to action (e.g. for a button or \"book a call\" link)."
    : "- Do NOT use {{cta_link}}: this outcome has no booking or offer link. Instead, close by inviting the reader to reply to this email directly.";
  const system = `You write short, friendly follow-up emails for quiz results pages.
Rules:
- "subject": a concise, compelling email subject line (under 10 words).
- "body": a warm, personal email body, under 150 words.
- Use the tokens {{name}} (recipient first name), {{quiz_title}}, {{owner_name}}, and {{outcome}} where natural.
${ctaInstruction}
- No em dashes anywhere. No hype. No numbered lists.
- Close warmly but do not invent a sign-off name; use {{owner_name}}.`;
  const user = `Quiz title: ${input.quizTitle}
Outcome name: ${input.outcomeName}
Outcome description: ${input.outcomeDescription}
Sender / owner name: ${input.ownerName}

Write one follow-up email for a recipient who got the "${input.outcomeName}" result.`;

  const res = await client.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 700,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: FOLLOW_UP_SCHEMA } },
    system,
    messages: [{ role: "user", content: user }],
  });

  const parsed = JSON.parse(textOf(res)) as { subject?: unknown; body?: unknown };
  return {
    subject: typeof parsed.subject === "string" && parsed.subject.trim() ? parsed.subject.trim() : "",
    body: typeof parsed.body === "string" && parsed.body.trim() ? parsed.body.trim() : "",
  };
}

// =============================================================================
// Single-item regeneration (build spec §5.3, the "give me another take" reroll).
// A cheap Haiku call that rewrites only the COPY of one question or one outcome.
// The hidden scoring logic (option tags/score, outcome match_logic, cta.url) is
// NEVER touched here — the caller keeps those fields and only swaps the wording,
// so the funnel stays consistent. Each function returns copy only.

function textOf(res: Anthropic.Message): string {
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

const REGEN_QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "options"],
  properties: {
    text: { type: "string" },
    options: { type: "array", items: { type: "string" } },
  },
} as const;

/**
 * Reword ONE question: a fresh question text and fresh answer labels in the SAME
 * order. The position of each answer must be preserved because the option's
 * tags/score (kept by the caller) wire it to outcomes. Returns labels by index;
 * the caller maps optionLabels[i] onto the existing option i.
 */
export async function regenerateQuestion(
  context: string,
  question: { text: string; options: { label: string; tags: string[] }[] },
): Promise<{ text: string; optionLabels: string[] }> {
  const client = new Anthropic();
  const optionsDesc = question.options
    .map((o, i) => `${i + 1}. "${o.label}" (keep this answer's meaning: ${o.tags.join(", ")})`)
    .join("\n");
  const system = `You rewrite ONE quiz question for a lead-generation quiz, giving a fresh take on the wording. Rules:
- Return a new question "text" and exactly ${question.options.length} answer "options", in the SAME order as given.
- Each new option must keep the SAME meaning as the original in that position, because hidden scoring depends on the order. Reword for freshness; never change which answer maps to what.
- Conversational, second-person, tight. Do not number the options or add letters. Never mention other tools.`;
  const user = `Business context:\n${context}\n\nCurrent question: "${question.text}"\nCurrent answers (order must be preserved):\n${optionsDesc}`;

  const res = await client.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 700,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: REGEN_QUESTION_SCHEMA } },
    system,
    messages: [{ role: "user", content: user }],
  });

  const parsed = JSON.parse(textOf(res)) as { text?: unknown; options?: unknown };
  const newText =
    typeof parsed.text === "string" && parsed.text.trim() ? parsed.text.trim() : question.text;
  const optionLabels = Array.isArray(parsed.options)
    ? parsed.options.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  return { text: newText, optionLabels };
}

const REGEN_OUTCOME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "recommendations", "cta_label"],
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    recommendations: { type: "array", items: { type: "string" } },
    cta_label: { type: "string" },
  },
} as const;

/**
 * Reword ONE outcome: a fresh name, one-sentence description, 2-3 recommendation
 * lines, and a CTA label. match_logic and cta.url are NOT returned — the caller
 * keeps them so the answer-to-outcome wiring and booking link are preserved.
 */
export async function regenerateOutcome(
  context: string,
  outcome: { name: string; description: string; recommendations: string[]; ctaLabel: string },
): Promise<{ name: string; description: string; recommendations: string[]; ctaLabel: string }> {
  const client = new Anthropic();
  const system = `You rewrite ONE quiz result (outcome) for a lead-generation quiz, giving a fresh take. Rules:
- "name": an identity-driven result name (e.g. "The Glow Getter"), never "Type A".
- "description": ONE sentence, max ~25 words.
- "recommendations": 2-3 of the business's ACTUAL offerings named with the EXACT wording from the context. Do not invent or rebrand. If the context names none, reuse the originals.
- "cta_label": a clear, action-oriented button label.
Keep it tight and on-brand. Never mention other tools.`;
  const user = `Business context:\n${context}\n\nCurrent result:\nName: "${outcome.name}"\nDescription: "${outcome.description}"\nRecommendations: ${outcome.recommendations.join(" | ")}\nButton label: "${outcome.ctaLabel}"`;

  const res = await client.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 600,
    thinking: { type: "disabled" },
    output_config: { format: { type: "json_schema", schema: REGEN_OUTCOME_SCHEMA } },
    system,
    messages: [{ role: "user", content: user }],
  });

  const parsed = JSON.parse(textOf(res)) as {
    name?: unknown;
    description?: unknown;
    recommendations?: unknown;
    cta_label?: unknown;
  };
  const recs = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  return {
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : outcome.name,
    description:
      typeof parsed.description === "string" && parsed.description.trim()
        ? parsed.description.trim()
        : outcome.description,
    recommendations: recs.length > 0 ? recs : outcome.recommendations,
    ctaLabel:
      typeof parsed.cta_label === "string" && parsed.cta_label.trim()
        ? parsed.cta_label.trim()
        : outcome.ctaLabel,
  };
}
