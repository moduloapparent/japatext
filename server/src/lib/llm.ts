import OpenAI from "openai";
import { DEFAULT_PRICE_PER_MTOK_USD, GENERATION_MODEL, PRICE_PER_MTOK_USD, isMockLlm, requireApiKey } from "../config.js";
import { recordUsage } from "../db/repo.js";
import { mockToolInput } from "./mockLlm.js";
import { GenerationError, type ChatMessage, type ReasoningEffort, type StructuredCallOptions } from "./llmTypes.js";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: requireApiKey() });
  }
  return client;
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_MTOK_USD[model] ?? DEFAULT_PRICE_PER_MTOK_USD;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

/**
 * GPT-5-mini and GPT-5.4-nano disagree on the reasoning_effort enum, and nano
 * additionally rejects non-none effort when using function tools on
 * /v1/chat/completions. Pick the cheapest legal value per model.
 */
function defaultReasoningEffort(model: string): ReasoningEffort {
  if (model.includes("nano")) return "none";
  return "minimal";
}

/**
 * Calls an OpenAI chat model with a single forced tool (Structured Outputs,
 * strict mode) so the response is guaranteed-shape JSON, validates it again
 * against a zod schema as a belt-and-suspenders check, and records local
 * usage for the cost dashboard. Retries once on a transient failure or
 * schema mismatch.
 */
export async function generateStructured<T>(opts: StructuredCallOptions<T>): Promise<{ data: T; usage: { inputTokens: number; outputTokens: number } }> {
  const model = opts.model ?? GENERATION_MODEL;
  // GPT-5 family counts reasoning toward max_completion_tokens. Default high
  // enough that medium-effort reasoning can't eat the whole budget before the
  // forced tool call is emitted.
  const maxTokens = opts.maxTokens ?? 4096;
  const reasoningEffort = opts.reasoningEffort ?? defaultReasoningEffort(model);

  if (isMockLlm()) {
    const start = Date.now();
    try {
      const raw = mockToolInput(opts.tool.name, opts.system, opts.messages);
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) {
        throw new GenerationError(`Mock fixture failed validation: ${parsed.error.message}`);
      }
      recordUsage({
        endpoint: opts.endpoint,
        model: "mock",
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - start,
        error: null,
        estimatedCostUsd: 0,
      });
      return { data: parsed.data, usage: { inputTokens: 0, outputTokens: 0 } };
    } catch (err) {
      recordUsage({
        endpoint: opts.endpoint,
        model: "mock",
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        estimatedCostUsd: null,
      });
      throw err;
    }
  }

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.system },
    ...opts.messages.map((m): OpenAI.Chat.ChatCompletionMessageParam => ({ role: m.role, content: m.content })),
  ];

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const start = Date.now();
    try {
      const response = await getClient().chat.completions.create({
        model,
        messages: openaiMessages,
        max_completion_tokens: maxTokens,
        reasoning_effort: reasoningEffort,
        tools: [
          {
            type: "function",
            function: {
              name: opts.tool.name,
              description: opts.tool.description,
              parameters: opts.tool.parameters,
              strict: true,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: opts.tool.name } },
      });

      const choice = response.choices[0];
      const toolCall = choice?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        const reason = choice?.finish_reason ?? "unknown";
        const reasoningTokens =
          (response.usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined)
            ?.completion_tokens_details?.reasoning_tokens ?? 0;
        throw new GenerationError(
          reason === "length"
            ? `Model hit the token limit before emitting a tool call (reasoning_tokens=${reasoningTokens}, max_completion_tokens=${maxTokens}).`
            : `Model did not return a tool call (finish_reason=${reason}).`
        );
      }

      let rawArgs: unknown;
      try {
        rawArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new GenerationError("Model returned tool arguments that were not valid JSON.");
      }

      const parsed = opts.schema.safeParse(rawArgs);
      if (!parsed.success) {
        throw new GenerationError(`Structured output failed validation: ${parsed.error.message}`);
      }

      const inputTokens = response.usage?.prompt_tokens ?? 0;
      const outputTokens = response.usage?.completion_tokens ?? 0;
      recordUsage({
        endpoint: opts.endpoint,
        model,
        inputTokens,
        outputTokens,
        latencyMs: Date.now() - start,
        error: null,
        estimatedCostUsd: estimateCostUsd(model, inputTokens, outputTokens),
      });

      return { data: parsed.data, usage: { inputTokens, outputTokens } };
    } catch (err) {
      lastError = err;
      recordUsage({
        endpoint: opts.endpoint,
        model,
        inputTokens: null,
        outputTokens: null,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        estimatedCostUsd: null,
      });
      // Only retry once, and only for transient/validation issues.
      continue;
    }
  }
  throw lastError instanceof Error ? lastError : new GenerationError("Generation failed.");
}

export type { ChatMessage };
