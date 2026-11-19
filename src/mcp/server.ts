#!/usr/bin/env node
/**
 * Choice OS MCP server.
 *
 * Hermes connects over stdio and gets the OS capabilities as tools: business snapshot,
 * operator tasks, email, Buffer social, Stripe checkout, CRM sync, calendar slots and media.
 *
 * Approval is explicit:
 *   CHOICE_OS_MCP_ALLOW_APPROVE=1  -> Hermes may approve its own send/publish tasks.
 *   unset (default)                -> Hermes can draft and queue; a human approves in the UI.
 */
import { createInterface } from "node:readline";
import { addMedia } from "../tools/media.ts";

const BASE = (process.env.CHOICE_OS_URL ?? "http://127.0.0.1:4177").replace(/\/$/, "");
const USER = process.env.CHOICE_OS_USER;
const PASS = process.env.CHOICE_OS_PASS;
const ALLOW_APPROVE = process.env.CHOICE_OS_MCP_ALLOW_APPROVE === "1";
const AUTH = USER && PASS ? `Basic ${Buffer.from(`${USER}:${PASS}`).toString("base64")}` : undefined;

async function http(path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(AUTH ? { authorization: AUTH } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

const TOOLS = [
  {
    name: "business_snapshot",
    description: "Read the current business: revenue, bookings, pipeline, missed calls, reviews and top decisions.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_operator_task",
    description:
      "Create a Hermes operator task: prospect_research, social_calendar, sales_sequence, crm_hygiene, send_email or social_publish. Sends/posts are queued for approval unless CHOICE_OS_MCP_ALLOW_APPROVE=1.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["prospect_research", "social_calendar", "sales_sequence", "crm_hygiene", "send_email", "social_publish"] },
        prompt: { type: "string" },
        to: { type: "string" },
        subject: { type: "string" },
        platforms: { type: "array", items: { type: "string" } },
        imageUrl: { type: "string" },
        videoUrl: { type: "string" },
        thumbnailUrl: { type: "string" },
        altText: { type: "string" },
        scheduledAt: { type: "string" },
      },
      required: ["type", "prompt"],
    },
  },
  {
    name: "list_operator_tasks",
    description: "List recent operator tasks and their status.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "approve_operator_task",
    description: "Approve a queued send_email or social_publish task. Requires CHOICE_OS_MCP_ALLOW_APPROVE=1.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "send_email",
    description: "Draft and send an email through Resend. Queues for approval unless CHOICE_OS_MCP_ALLOW_APPROVE=1.",
    inputSchema: {
      type: "object",
      properties: { to: { type: "string" }, subject: { type: "string" }, prompt: { type: "string" } },
      required: ["to", "subject", "prompt"],
    },
  },
  {
    name: "publish_social",
    description:
      "Draft and publish a social post through Buffer (image/video) or the social webhook. Queues for approval unless CHOICE_OS_MCP_ALLOW_APPROVE=1.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        platforms: { type: "array", items: { type: "string" } },
        imageUrl: { type: "string" },
        videoUrl: { type: "string" },
        thumbnailUrl: { type: "string" },
        altText: { type: "string" },
        scheduledAt: { type: "string" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "stripe_checkout",
    description: "Create a Stripe subscription Checkout URL for the pilot.",
    inputSchema: { type: "object", properties: { email: { type: "string" } } },
  },
  {
    name: "crm_sync",
    description: "Push the current book to the configured CRM webhook.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "calendar_slots",
    description: "Read the next available Cal.diy / Cal.com slots.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "buffer_channels",
    description: "List the Buffer channels and IDs connected to the account.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "media_add",
    description: "Copy a local image/video into the public media route and return its public URL.",
    inputSchema: { type: "object", properties: { file: { type: "string" } }, required: ["file"] },
  },
];

async function runTaskAndMaybeApprove(type: string, args: Record<string, unknown>): Promise<any> {
  const task = await http("/api/operator/tasks", {
    method: "POST",
    body: JSON.stringify({ type, ...args }),
  });
  if (!ALLOW_APPROVE) return { status: "needs_approval", task: task.task, note: "Approve in the Operator tab or set CHOICE_OS_MCP_ALLOW_APPROVE=1." };
  const id = task.task?.id;
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const current = await http(`/api/operator/tasks/${id}`);
    if (current.task?.status === "needs_approval") {
      return http(`/api/operator/tasks/${id}/approve`, { method: "POST", body: "{}" });
    }
    if (current.task?.status === "failed") throw new Error(current.task.error ?? "task failed");
  }
  throw new Error("task did not finish in time");
}

async function callTool(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    case "business_snapshot": {
      const b = await http("/api/business");
      return {
        tenant: b.tenant,
        revenueRecovered: b.kpis?.revenueRecovered ?? b.revenueRecovered,
        jobsBooked: b.kpis?.jobsBooked ?? b.jobsBooked,
        pipeline: b.kpis?.pipelineAtStake ?? b.pipeline,
        missedCalls: b.kpis?.missedCalls,
        openReviews: b.kpis?.reviewsToAsk,
        queue: b.queue?.slice(0, 8),
      };
    }
    case "create_operator_task":
      return http("/api/operator/tasks", { method: "POST", body: JSON.stringify(args) });
    case "list_operator_tasks":
      return http("/api/operator/tasks");
    case "approve_operator_task":
      if (!ALLOW_APPROVE) throw new Error("Set CHOICE_OS_MCP_ALLOW_APPROVE=1 to let Hermes approve its own sends.");
      return http(`/api/operator/tasks/${args.id}/approve`, { method: "POST", body: "{}" });
    case "send_email":
      return runTaskAndMaybeApprove("send_email", args);
    case "publish_social":
      return runTaskAndMaybeApprove("social_publish", args);
    case "stripe_checkout":
      return http("/api/billing/checkout", { method: "POST", body: JSON.stringify({ email: args.email }) });
    case "crm_sync":
      return http("/api/crm/sync", { method: "POST", body: "{}" });
    case "calendar_slots":
      return http("/api/calendar/slots");
    case "buffer_channels":
      return http("/api/social/channels");
    case "media_add": {
      const media = await addMedia(String(args.file));
      return { url: media.url, filename: media.filename, bytes: media.bytes };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let request: any;
  try {
    request = JSON.parse(trimmed);
  } catch {
    process.stderr.write(`choice-os-mcp: invalid JSON\n`);
    return;
  }
  if (request.id === undefined) return;
  try {
    if (request.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: request.params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "choice-os", version: "1.0.0" },
        },
      });
      return;
    }
    if (request.method === "tools/list") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools: TOOLS } });
      return;
    }
    if (request.method === "tools/call") {
      const name = request.params?.name;
      const args = request.params?.arguments ?? {};
      const result = await callTool(name, args);
      send({
        jsonrpc: "2.0",
        id: request.id,
        result: { content: [{ type: "text", text: text(result) }], isError: false },
      });
      return;
    }
    send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id: request.id,
      result: {
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        isError: true,
      },
    });
  }
});
