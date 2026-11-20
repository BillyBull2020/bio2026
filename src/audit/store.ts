import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AuditInput, AuditResult } from "./calculator.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DIR = join(ROOT, "data", "audit");
const FILE = join(DIR, "leads.json");

export interface AuditLead {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  company: string;
  trade: string;
  input: AuditInput;
  result: AuditResult;
  source: string;
}

async function load(): Promise<AuditLead[]> {
  try {
    const parsed = JSON.parse(await readFile(FILE, "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as AuditLead[]) : [];
  } catch {
    return [];
  }
}

export async function saveAuditLead(
  input: AuditInput,
  result: AuditResult,
  lead: { name: string; email: string; company: string; source: string },
): Promise<AuditLead> {
  const entry: AuditLead = {
    id: `aud_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    name: lead.name,
    email: lead.email,
    company: lead.company,
    trade: input.trade,
    input,
    result,
    source: lead.source,
  };
  const all = await load();
  all.push(entry);
  await mkdir(DIR, { recursive: true });
  await writeFile(FILE, `${JSON.stringify(all, null, 2)}\n`, "utf8");
  return entry;
}

export async function listAuditLeads(): Promise<AuditLead[]> {
  return (await load()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
