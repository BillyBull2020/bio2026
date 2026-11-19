import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ImportSummary,
  ProofVideoJob,
  SellbirdProspect,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from "./types.ts";
import {
  SELLBIRD_WARNING,
  buildProofVideoJob,
  contactInputFromProspect,
  prospectsFromCsv,
} from "./types.ts";

async function importSellbird(
  input: { file: string; limit?: number },
  ctx: ToolContext,
): Promise<ToolResult<ImportSummary>> {
  const text = await readFile(input.file, "utf8");
  const prospects = prospectsFromCsv(text).slice(0, input.limit ?? 5_000);
  const existing = new Set(ctx.store.contacts().map((c) => c.email.toLowerCase()).filter(Boolean));
  const summary: ImportSummary = {
    imported: 0,
    skippedExisting: 0,
    skippedNoEmail: 0,
    contacts: [],
    warning: SELLBIRD_WARNING,
  };

  for (const p of prospects) {
    const email = p.email.trim().toLowerCase();
    if (!email) {
      summary.skippedNoEmail++;
      continue;
    }
    if (existing.has(email)) {
      summary.skippedExisting++;
      continue;
    }
    const contact = ctx.store.createContact(contactInputFromProspect(p, ctx.tenant), ctx.now);
    existing.add(email);
    summary.imported++;
    if (summary.contacts.length < 20) summary.contacts.push(contact.id);
  }

  return { ok: true, output: summary };
}

async function queueProofVideo(
  input: { contactId: string; outDir: string },
  ctx: ToolContext,
): Promise<ToolResult<{ job: ProofVideoJob; path: string }>> {
  const contact = ctx.store.getContact(input.contactId);
  if (!contact) return { ok: false, error: `contact ${input.contactId} not found` };
  const claimIds = ctx.store.claims
    .filter((c) => !c.segment || c.segment === "*" || c.segment === contact.trade)
    .map((c) => c.id);
  const job = buildProofVideoJob(contact, ctx.now, claimIds);
  await mkdir(input.outDir, { recursive: true });
  const path = join(input.outDir, `${job.id}.json`);
  await writeFile(path, JSON.stringify(job, null, 2), "utf8");
  return { ok: true, output: { job, path } };
}

/**
 * The allowlist is the point. A tool that can send is only available to roles that are
 * allowed to send; a tool that can write contacts is analyst/human only; nothing here can
 * change the scheduler.
 */
export const TOOLS: ToolDefinition<any, any>[] = [
  {
    id: "sellbird.import",
    name: "Import Sellbird prospects",
    description:
      "Parse a Sellbird CSV export into contacts with no marketing consent and zero pressure budget. Discovery only; the kernel still refuses outreach.",
    permission: "write",
    roles: ["analyst", "human"],
    run: importSellbird,
  },
  {
    id: "hyperframes.proof",
    name: "Queue a HyperFrames proof video",
    description:
      "Write a 10-second proof-video job manifest for HyperFrames. The asset is proof, not a claim until a human verifies it.",
    permission: "write",
    roles: ["analyst", "advocate", "human"],
    run: queueProofVideo,
  },
];

export function toolById(id: string): ToolDefinition<any, any> | undefined {
  return TOOLS.find((t) => t.id === id);
}

export function roleCanUseTool(roleId: string, toolId: string): boolean {
  const tool = toolById(toolId);
  return Boolean(tool && tool.roles.includes(roleId));
}

export function listTools(): Array<Pick<ToolDefinition<unknown, unknown>, "id" | "name" | "permission" | "roles">> {
  return TOOLS.map(({ id, name, permission, roles }) => ({ id, name, permission, roles }));
}

export type { SellbirdProspect };
