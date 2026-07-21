import { z } from "zod";

/** Provider-neutral chat message. Every provider adapter maps this to its own wire format. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A structured-output tool definition in OpenAI Structured Outputs shape
 * (json_schema, strict mode). Strict mode requires every property to be
 * listed in `required` (optional fields are modeled as nullable types) and
 * `additionalProperties: false` on every object level.
 */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface StructuredCallOptions<T> {
  endpoint: string;
  system: string;
  messages: ChatMessage[];
  tool: ToolSchema;
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  model?: string;
  /**
   * Upper bound on completion tokens INCLUDING reasoning tokens for GPT-5
   * family models. Too low and the model can spend the whole budget on
   * reasoning and return no tool call (finish_reason=length).
   */
  maxTokens?: number;
  /** GPT-5 reasoning effort. If omitted, chosen per model (see llm.ts). */
  reasoningEffort?: ReasoningEffort;
}

export class GenerationError extends Error {}
