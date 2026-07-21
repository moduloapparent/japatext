import { z } from "zod";

// Helpers to bridge OpenAI Structured Outputs strict mode (which requires
// every property to be present in `required`, so "optional" fields are
// modeled as nullable) back onto the zod defaults the rest of the app expects.
const nullableString = (fallback = "") => z.string().nullable().optional().transform((v) => v ?? fallback);
const nullableBool = (fallback = false) => z.boolean().nullable().optional().transform((v) => v ?? fallback);

// --- Character reply generation (in-character voice; gpt-5-mini) ---------------

export const MemoryUpdateSchema = z.object({
  type: z.enum(["fact", "event", "preference"]).default("fact"),
  content: z.string(),
});

export const StoryThreadUpdateSchema = z.object({
  thread_title: z.string(),
  status: z.enum(["open", "paused", "resolved"]).default("open"),
  note: nullableString(),
});

export const ReplyResultSchema = z.object({
  message: z.string(),
  subject: nullableString(),
  register: nullableString(),
  intent_summary: nullableString(),
  memory_updates: z.array(MemoryUpdateSchema).default([]),
  story_thread_updates: z.array(StoryThreadUpdateSchema).default([]),
});
export type ReplyResult = z.infer<typeof ReplyResultSchema>;

export const REPLY_TOOL_SCHEMA = {
  name: "send_reply",
  description:
    "Produce the character's in-character reply plus structured metadata about story state. The 'message' field is the ONLY thing shown to the learner.",
  parameters: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      message: {
        type: "string",
        description: "The character's reply, written entirely in natural Japanese, in their voice.",
      },
      subject: {
        type: ["string", "null"],
        description: "Email subject line. Null/empty for chat messages.",
      },
      register: {
        type: ["string", "null"],
        description: "Short label for the register used, e.g. casual, keigo, polite-neutral.",
      },
      intent_summary: {
        type: ["string", "null"],
        description: "One short English sentence describing the communicative intent of this reply.",
      },
      memory_updates: {
        type: "array",
        description: "New durable facts/events about the character or relationship established in this reply.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["fact", "event", "preference"] },
            content: { type: "string" },
          },
          required: ["type", "content"],
        },
      },
      story_thread_updates: {
        type: "array",
        description: "Updates to ongoing story threads this reply advances, pauses, or resolves.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            thread_title: { type: "string" },
            status: { type: "string", enum: ["open", "paused", "resolved"] },
            note: { type: ["string", "null"] },
          },
          required: ["thread_title", "status", "note"],
        },
      },
    },
    required: ["message", "subject", "register", "intent_summary", "memory_updates", "story_thread_updates"],
  },
};

// --- Difficulty tagging (mechanical extraction; gpt-5.4-nano) -------------------
// Runs on the already-written Japanese text to flag vocab/grammar that is
// likely beyond the learner's current known set. Kept separate from
// generation so the creative-writing call isn't also responsible for
// self-grading its own difficulty.

export const VocabItemSchema = z.object({
  surface: z.string(),
  reading: nullableString(),
  lemma: z.string(),
  meaning_note: nullableString(),
  is_protected: nullableBool(),
});

export const GrammarItemSchema = z.object({
  pattern: z.string(),
  note: nullableString(),
});

export const DifficultyTagResultSchema = z.object({
  new_vocabulary: z.array(VocabItemSchema).default([]),
  new_grammar: z.array(GrammarItemSchema).default([]),
});
export type DifficultyTagResult = z.infer<typeof DifficultyTagResultSchema>;

export const TAG_DIFFICULTY_TOOL_SCHEMA = {
  name: "tag_difficulty",
  description:
    "Given a Japanese message and the learner's known vocabulary/grammar, list the words/chunks and grammar patterns in the message that are likely beyond the learner's current level.",
  parameters: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      new_vocabulary: {
        type: "array",
        description:
          "Words/chunks in the message that are likely beyond the learner's current known set. Empty array if none.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            surface: { type: "string" },
            reading: { type: ["string", "null"] },
            lemma: { type: "string", description: "Dictionary form." },
            meaning_note: { type: ["string", "null"] },
            is_protected: {
              type: ["boolean", "null"],
              description: "True for names, fixed set phrases, or topic-critical words that should not be simplified away.",
            },
          },
          required: ["surface", "reading", "lemma", "meaning_note", "is_protected"],
        },
      },
      new_grammar: {
        type: "array",
        description: "Grammar patterns used that are likely new/advanced for the learner.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            pattern: { type: "string" },
            note: { type: ["string", "null"] },
          },
          required: ["pattern", "note"],
        },
      },
    },
    required: ["new_vocabulary", "new_grammar"],
  },
};

// --- Message analysis (study drawer gloss; gpt-5.4-nano) ------------------------

export const GlossTokenSchema = z.object({
  surface: z.string(),
  reading: nullableString(),
  lemma: nullableString(),
  meaning: nullableString(),
  note: nullableString(),
});

export const GlossResultSchema = z.object({
  overview: z.string(),
  tokens: z.array(GlossTokenSchema).default([]),
  grammar_points: z
    .array(z.object({ pattern: z.string(), explanation: z.string() }))
    .default([]),
  functional_note: nullableString(),
  english_gloss: nullableString(),
});
export type GlossResult = z.infer<typeof GlossResultSchema>;

export const GLOSS_TOOL_SCHEMA = {
  name: "explain_message",
  description:
    "Explain a Japanese message for a learner: word breakdown, grammar, and the functional/pragmatic role of the message, prioritizing meaning and intent over literal word-for-word translation.",
  parameters: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      overview: {
        type: "string",
        description: "One or two sentences on what this message is doing communicatively, in context.",
      },
      tokens: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            surface: { type: "string" },
            reading: { type: ["string", "null"] },
            lemma: { type: ["string", "null"] },
            meaning: { type: ["string", "null"] },
            note: { type: ["string", "null"], description: "Nuance, collocation, or usage note if relevant." },
          },
          required: ["surface", "reading", "lemma", "meaning", "note"],
        },
      },
      grammar_points: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            pattern: { type: "string" },
            explanation: { type: "string" },
          },
          required: ["pattern", "explanation"],
        },
      },
      functional_note: {
        type: ["string", "null"],
        description: "What a literal/English-minded reading would miss about this message, if anything.",
      },
      english_gloss: {
        type: ["string", "null"],
        description: "An optional natural English rendering, for when the learner wants it. Not a substitute for the notes above.",
      },
    },
    required: ["overview", "tokens", "grammar_points", "functional_note", "english_gloss"],
  },
};

// --- Native phrasing comparison (gpt-5.4-nano) -----------------------------------

export const ComparisonResultSchema = z.object({
  inferred_intent: z.string(),
  sounds_natural: z.boolean(),
  minimal_revision: nullableString(),
  idiomatic_alternative: nullableString(),
  differences: nullableString(),
});
export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;

export const COMPARISON_TOOL_SCHEMA = {
  name: "compare_phrasing",
  description:
    "Given a learner's Japanese message in context, infer what they meant to communicate, then show how a native speaker would express that same intent, focused on nuance/register rather than literal correction.",
  parameters: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      inferred_intent: {
        type: "string",
        description: "Plain-English statement of what you believe the learner intended to communicate.",
      },
      sounds_natural: {
        type: "boolean",
        description: "True if the learner's original message already sounds like natural Japanese for this context.",
      },
      minimal_revision: {
        type: ["string", "null"],
        description: "The learner's message with the smallest natural change needed. Null if already natural.",
      },
      idiomatic_alternative: {
        type: ["string", "null"],
        description: "A more idiomatic way a native speaker might phrase the same intent, if meaningfully different.",
      },
      differences: {
        type: ["string", "null"],
        description: "Concise notes on how implication, stance, or register differ between the versions.",
      },
    },
    required: ["inferred_intent", "sounds_natural", "minimal_revision", "idiomatic_alternative", "differences"],
  },
};

// --- Character-initiated message (gpt-5-mini) ------------------------------------

export const InitiationResultSchema = ReplyResultSchema.extend({
  should_send: z.boolean().default(true),
});
export type InitiationResult = z.infer<typeof InitiationResultSchema>;

export const INITIATION_TOOL_SCHEMA = {
  name: "send_initiated_message",
  description:
    "Decide whether this character would plausibly reach out right now given time elapsed and open threads, and if so, produce that message.",
  parameters: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      should_send: {
        type: "boolean",
        description: "False if it would be more natural for this character to stay quiet right now.",
      },
      ...REPLY_TOOL_SCHEMA.parameters.properties,
    },
    required: ["should_send", ...REPLY_TOOL_SCHEMA.parameters.required],
  },
};
