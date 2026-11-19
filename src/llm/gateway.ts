import type { Channel, Move } from "../neuro/types.ts";

/**
 * A rewrite-only model layer.
 *
 * The model is never asked what to do, who to target, which claim to use or when to send.
 * It receives a legal move, a grounded message and a guard, and may return a better sentence
 * with the same facts. The policy gate runs again on its output. If anything is unavailable,
 * the deterministic message is sent unchanged.
 */
export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface RewriteInput {
  body: string;
  move: Move;
  channel: Channel;
  guard: string;
  claimIds: string[];
}

export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const baseUrl = env.CHOICE_LLM_BASE_URL;
  const apiKey = env.CHOICE_LLM_API_KEY;
  const model = env.CHOICE_LLM_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    model,
    timeoutMs: Number(env.CHOICE_LLM_TIMEOUT_MS ?? 8_000),
  };
}

export function buildRewritePrompt(input: RewriteInput): { system: string; user: string } {
  const max = input.channel === "sms" ? 320 : input.channel === "voice" ? 420 : 1_400;
  const system = [
    "You are the voice layer of BioDynamX Choice OS.",
    "You rewrite a message that has already been approved by a policy kernel.",
    "You do not decide strategy, timing, targeting, claims or deadlines.",
    "",
    "HARD RULES:",
    "1. Preserve every number, name, date and claim exactly. Do not add any new number.",
    "2. Do not add guarantees, percentages, scarcity, countdowns, or 'act now' language.",
    "3. Do not add medical, legal or financial advice.",
    "4. Keep the opt-out instruction if the original has one.",
    "5. Keep the AI disclosure if the original has one.",
    "6. Keep it under " + max + " characters.",
    "7. Return only JSON: {\"body\": \"...\"}. No markdown fences, no commentary.",
  ].join("\n");

  const user = [
    `MOVE: ${input.move.label} (${input.move.intent})`,
    `CHANNEL: ${input.channel}`,
    `GUARD: ${input.guard}`,
    `CLAIMS ATTACHED: ${input.claimIds.join(", ") || "none"}`,
    "",
    "ORIGINAL MESSAGE:",
    input.body,
  ].join("\n");

  return { system, user };
}

function looksSafe(original: string, rewritten: string): boolean {
  if (!rewritten || rewritten.length < 10) return false;
  const hadStop = /\bstop\b/i.test(original);
  const hasStop = /\bstop\b/i.test(rewritten);
  if (hadStop && !hasStop) return false;
  const hadAi = /\bai\b|automated|assistant/i.test(original);
  const hasAi = /\bai\b|automated|assistant/i.test(rewritten);
  if (hadAi && !hasAi) return false;
  if (/\bguarantee|100\s?%|risk[- ]free\b/i.test(rewritten)) return false;
  if (/\b(?:expires|ends)\s+(?:today|tonight|tomorrow)\b/i.test(rewritten)) return false;
  return true;
}

export async function rewriteMessage(
  input: RewriteInput,
  config: LlmConfig | null = llmConfigFromEnv(),
): Promise<{ body: string; model: string | null; usedModel: boolean; reason?: string }> {
  if (!config) return { body: input.body, model: null, usedModel: false, reason: "not configured" };

  const { system, user } = buildRewritePrompt(input);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        max_tokens: 400,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) {
      return { body: input.body, model: config.model, usedModel: false, reason: `provider ${response.status}` };
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content) as { body?: unknown };
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    if (!looksSafe(input.body, body)) {
      return { body: input.body, model: config.model, usedModel: false, reason: "rewrite rejected by local guard" };
    }
    return { body, model: config.model, usedModel: true };
  } catch (error) {
    return {
      body: input.body,
      model: config.model,
      usedModel: false,
      reason: error instanceof Error ? error.message : "rewrite failed",
    };
  }
}
