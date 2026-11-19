import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { hermesStatus } from "../tools/hermes.ts";
import type { Tenant } from "../kernel/store.ts";
import type { OperatorTask, OperatorTaskType } from "./types.ts";
import { updateOperatorTask } from "./store.ts";

const execFileAsync = promisify(execFile);

const SKILLS: Record<OperatorTaskType, { skill: string; toolsets?: string; maxTurns: number; approval: boolean }> = {
  prospect_research: { skill: "prospect-research", toolsets: "web", maxTurns: 8, approval: false },
  social_calendar: { skill: "social-calendar", maxTurns: 1, approval: false },
  sales_sequence: { skill: "sales-sequence", maxTurns: 1, approval: false },
  crm_hygiene: { skill: "crm-hygiene", maxTurns: 1, approval: false },
  send_email: { skill: "email-draft", maxTurns: 1, approval: true },
  social_publish: { skill: "social-post", maxTurns: 1, approval: true },
};

export const OPERATOR_TYPES: Array<{ id: OperatorTaskType; label: string; description: string; approval: boolean }> = [
  { id: "prospect_research", label: "Find prospects", description: "Research local businesses with sources; no invented emails.", approval: false },
  { id: "social_calendar", label: "Social calendar", description: "Draft a week of posts for approval.", approval: false },
  { id: "sales_sequence", label: "Sales sequence", description: "Draft a 3-email outbound sequence.", approval: false },
  { id: "crm_hygiene", label: "CRM audit", description: "Find duplicates, missing consent and stale records.", approval: false },
  { id: "send_email", label: "Send email", description: "Draft and send after approval through Resend.", approval: true },
  { id: "social_publish", label: "Publish social post", description: "Draft and publish after approval through your social webhook.", approval: true },
];

function buildPrompt(task: OperatorTask, tenant: Tenant): string {
  return [
    `You are Hermes, the operator for ${tenant.name}, a ${tenant.trade} business in ${tenant.city}, ${tenant.state}.`,
    `The owner is ${tenant.ownerName}. Average ticket: $${tenant.avgTicket.toLocaleString()}.`,
    "You are executing one operator task. Return only the deliverable, no preamble.",
    "Return plain markdown or text. Do not wrap the answer in JSON or code fences.",
    "Never invent a fact, a customer, a review, a price or a deadline. If a field is unknown, write `unknown`.",
    "",
    `TASK TYPE: ${task.type}`,
    `TASK: ${task.prompt}`,
    ...(task.meta.to ? [`RECIPIENT: ${task.meta.to}`] : []),
    ...(task.meta.subject ? [`SUBJECT: ${task.meta.subject}`] : []),
    ...(task.meta.platforms?.length ? [`PLATFORMS: ${task.meta.platforms.join(", ")}`] : []),
    ...(task.type === "send_email"
      ? [
          "Return only the email body. Do not include To, From, Subject, or a claim that it was sent.",
          "Do not claim a prior conversation, call, estimate or relationship unless the task brief says so.",
        ]
      : []),
    ...(task.type === "social_publish" ? ["Return only the post text. Do not include a table or JSON."] : []),
    "",
    "Stay inside the business context and the skill rules. Do not claim an action you did not take.",
  ].join("\n");
}

async function runOnce(
  bin: string,
  prompt: string,
  provider: string,
  model: string,
  skill: string,
  toolsets: string | undefined,
  maxTurns: number,
  timeoutMs: number,
): Promise<{ ok: boolean; text: string; provider: string; model: string; error?: string }> {
  const workspace = join(process.cwd(), "data", "operator", "workspace");
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
    "-s",
    skill,
    "--max-turns",
    String(maxTurns),
  ];
  if (toolsets) args.push("-t", toolsets, "--yolo");

  try {
    const { stdout } = await execFileAsync(bin, args, {
      cwd: workspace,
      timeout: timeoutMs,
      maxBuffer: 4_000_000,
      windowsHide: true,
      env: { ...process.env, HERMES_NO_UPDATE_CHECK: "1" },
    });
    const text = String(stdout).replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").trim();
    return { ok: Boolean(text), text, provider, model, error: text ? undefined : "empty response" };
  } catch (error) {
    const details = error as { stdout?: string; message?: string };
    const text = String(details.stdout ?? "").replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").trim();
    if (text && !/Traceback|Provider said|No reply/i.test(text)) return { ok: true, text, provider, model };
    return { ok: false, text: "", provider, model, error: details.message ?? "Hermes failed" };
  }
}

export async function runOperatorTask(task: OperatorTask, tenant: Tenant): Promise<OperatorTask | undefined> {
  const status = hermesStatus();
  if (!status.available) {
    return updateOperatorTask(task.id, {
      status: "failed",
      error: "Hermes is not installed. Set HERMES_BIN.",
    });
  }

  await updateOperatorTask(task.id, { status: "running", error: undefined });
  const config = SKILLS[task.type];
  const prompt = buildPrompt(task, tenant);
  const started = Date.now();

  const attempts = [
    {
      provider: process.env.OPERATOR_PROVIDER ?? status.provider,
      model: process.env.OPERATOR_MODEL ?? "qwen/qwen3-235b-a22b:free",
    },
    ...(status.fallback ? [status.fallback] : []),
  ];

  let lastError = "Hermes failed";
  for (const attempt of attempts) {
    const result = await runOnce(
      status.bin,
      prompt,
      attempt.provider,
      attempt.model,
      config.skill,
      config.toolsets,
      config.maxTurns,
      180_000,
    );
    if (result.ok) {
      return updateOperatorTask(task.id, {
        status: config.approval ? "needs_approval" : "done",
        output: result.text,
        model: result.model,
        provider: result.provider,
        durationMs: Date.now() - started,
      });
    }
    lastError = result.error ?? lastError;
  }

  return updateOperatorTask(task.id, {
    status: "failed",
    error: lastError,
    durationMs: Date.now() - started,
  });
}
