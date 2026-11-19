import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Hermes is the operator's chief of staff, not a second decision engine.
 *
 * It may read a snapshot of the book and write a plan, a report or a risk list.
 * It may not send, change consent, alter the decision log, or claim it took an
 * action. The kernel remains the only place that decides.
 */
export interface OpsSnapshot {
  tenant: string;
  revenueRecovered: number;
  jobsBooked: number;
  pipelineValue: number;
  missedCalls: number;
  actionsToday: number;
  openReviews: number;
  top: Array<{
    name: string;
    situation: string;
    move: string;
    value: number;
    readiness: number;
    blocked: boolean;
  }>;
}

export interface HermesStatus {
  available: boolean;
  bin: string;
  provider: string;
  model: string;
  fallback?: { provider: string; model: string };
}

export interface HermesAnswer {
  ok: boolean;
  text: string;
  model: string;
  provider: string;
  durationMs: number;
  error?: string;
}

const DEFAULT_BIN = process.env.HERMES_BIN ?? "C:\\Users\\billy\\AppData\\Local\\hermes\\bin\\hermes.exe";
const DEFAULT_PROVIDER = process.env.HERMES_PROVIDER ?? "openrouter";
const DEFAULT_MODEL = process.env.HERMES_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free";
const FALLBACK_PROVIDER = process.env.HERMES_FALLBACK_PROVIDER ?? "ollama";
const FALLBACK_MODEL = process.env.HERMES_FALLBACK_MODEL ?? "nemotron-3.5-lightning:30b-a3b";

export function hermesStatus(): HermesStatus {
  return {
    available: existsSync(DEFAULT_BIN) || DEFAULT_BIN === "hermes",
    bin: DEFAULT_BIN,
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    ...(process.env.HERMES_NO_FALLBACK === "1"
      ? {}
      : { fallback: { provider: FALLBACK_PROVIDER, model: FALLBACK_MODEL } }),
  };
}

export function buildOpsPrompt(snapshot: OpsSnapshot, question: string): string {
  return [
    "You are Hermes, the operations analyst for BioDynamX Choice OS.",
    "You are read-only. You cannot send messages, change consent, book jobs, or alter the decision log.",
    "Never claim you took an action. Never invent a number. Use only the snapshot below.",
    "The `top` array is the priority list: six contacts, their situation, the recommended move, value and readiness.",
    "When asked what to focus on, list all six contacts in the `top` array as bullets: name — move — value — readiness.",
    "Add one sentence at the end on what to do first.",
    "Answer in plain text, no JSON, no markdown tables, max 180 words. Be specific to these numbers.",
    "If the question needs data you do not have, say what is missing in one sentence.",
    "",
    "BUSINESS SNAPSHOT",
    JSON.stringify(snapshot, null, 2),
    "",
    "QUESTION",
    question,
  ].join("\n");
}

export function cleanHermesOutput(raw: string): string {
  const withoutAnsi = raw.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
  return withoutAnsi
    .split("\n")
    .filter((line) => !/^\s*(?:[│┃]|╭|╰|─)/.test(line))
    .join("\n")
    .trim();
}

async function runHermesOnce(
  bin: string,
  prompt: string,
  provider: string,
  model: string,
  timeoutMs: number,
  started: number,
): Promise<HermesAnswer> {
  const workspace = join(process.cwd(), "data", "hermes");
  await mkdir(workspace, { recursive: true });
  const args = [
    "chat",
    "-q",
    prompt,
    "--oneshot",
    "-Q",
    "--format",
    "text",
    "--provider",
    provider,
    "-m",
    model,
    "--max-turns",
    "1",
  ];

  try {
    const { stdout } = await execFileAsync(bin, args, {
      cwd: workspace,
      timeout: timeoutMs,
      maxBuffer: 2_000_000,
      windowsHide: true,
      env: { ...process.env, HERMES_NO_UPDATE_CHECK: "1" },
    });
    const text = cleanHermesOutput(String(stdout));
    if (!text) {
      return { ok: false, text: "", model, provider, durationMs: Date.now() - started, error: "Hermes returned an empty response." };
    }
    if (/No reply: every provider|Provider said|temporarily unavailable/i.test(text)) {
      return { ok: false, text: "", model, provider, durationMs: Date.now() - started, error: text.slice(0, 300) };
    }
    return { ok: true, text, model, provider, durationMs: Date.now() - started };
  } catch (error) {
    // Hermes exits 1 on some local-provider paths even when it printed a valid answer
    // (Ollama does this). Keep the usable stdout, reject tracebacks and provider failures.
    const details = error as { stdout?: string; stderr?: string; killed?: boolean; message?: string };
    const out = cleanHermesOutput(String(details.stdout ?? ""));
    if (out && !/No reply: every provider|Provider said|temporarily unavailable|Traceback|Error:/i.test(out)) {
      return { ok: true, text: out, model, provider, durationMs: Date.now() - started };
    }
    const message = details.message ?? String(error);
    return {
      ok: false,
      text: "",
      model,
      provider,
      durationMs: Date.now() - started,
      error: /timed out|killed/i.test(message) ? "Hermes timed out. Try a shorter question." : message.slice(0, 300),
    };
  }
}

export async function askHermes(
  snapshot: OpsSnapshot,
  question: string,
  options: {
    timeoutMs?: number;
    bin?: string;
    provider?: string;
    model?: string;
    fallback?: { provider: string; model: string } | false;
  } = {},
): Promise<HermesAnswer> {
  const status = hermesStatus();
  const bin = options.bin ?? status.bin;
  const provider = options.provider ?? status.provider;
  const model = options.model ?? status.model;
  const started = Date.now();

  if (!existsSync(bin) && bin !== "hermes") {
    return { ok: false, text: "", model, provider, durationMs: 0, error: "Hermes is not installed at the configured path." };
  }

  const attempts = [{ provider, model }];
  const fallback = options.fallback === false ? undefined : (options.fallback ?? status.fallback);
  if (fallback && (fallback.provider !== provider || fallback.model !== model)) attempts.push(fallback);

  const prompt = buildOpsPrompt(snapshot, question);
  let last: HermesAnswer | null = null;
  for (const attempt of attempts) {
    const result = await runHermesOnce(bin, prompt, attempt.provider, attempt.model, options.timeoutMs ?? 90_000, started);
    if (result.ok) return result;
    last = result;
  }
  return last ?? {
    ok: false,
    text: "",
    model,
    provider,
    durationMs: Date.now() - started,
    error: "Hermes has no configured model.",
  };
}
