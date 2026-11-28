import Anthropic from "@anthropic-ai/sdk";

/** Shared Claude client + structured-output helper for the inbox agent and the AI Chat. */

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
export const AGENT_MODEL = "claude-opus-5-5";

/** JSON schema for a value that may be null. */
export const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });
export const str = { type: "string" } as const;
export const int = { type: "integer" } as const;
export const num = { type: "number" } as const;
export const bool = { type: "boolean" } as const;
export const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const arr = (items: unknown) => ({ type: "array", items });

export class AiRefusalError extends Error {}

/**
 * One request whose answer must match `schema` (structured outputs).
 * `content` is the user turn: text and/or document/image blocks.
 */
export async function structured<T>(opts: {
  system: string;
  content: string | Anthropic.ContentBlockParam[];
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<T> {
  const response = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    system: opts.system,
    output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: opts.schema } },
    messages: [{ role: "user", content: opts.content }],
  });
  if (response.stop_reason === "refusal") throw new AiRefusalError("O modelo recusou este pedido.");
  if (response.stop_reason === "max_tokens") throw new Error("Resposta do AI cortada (max_tokens).");
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as T;
}
