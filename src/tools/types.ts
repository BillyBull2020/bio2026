import type { Tenant } from "../kernel/store.ts";
import type { KernelStore } from "../kernel/store.ts";
import type { Contact } from "../neuro/types.ts";

/**
 * Tools are capabilities, not agents.
 *
 * A tool has one job, a permission level, and a role allowlist. It returns data and
 * proposed events; the kernel decides whether those events become state. This is the
 * boundary that keeps a browser bot, a video generator or an outreach platform from
 * becoming a second orchestrator.
 */
export type ToolPermission = "read" | "write" | "send";

export interface ToolContext {
  tenant: Tenant;
  now: string;
  store: KernelStore;
}

export interface ToolResult<T> {
  ok: boolean;
  output?: T;
  error?: string;
  /** Events the kernel may emit after validating them. */
  proposedEvents?: Array<{ type: string; payload: Record<string, unknown>; contactId?: string }>;
}

export interface ToolDefinition<I, O> {
  id: string;
  name: string;
  description: string;
  permission: ToolPermission;
  roles: string[];
  run: (input: I, ctx: ToolContext) => Promise<ToolResult<O>>;
}

export interface SellbirdProspect {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  website: string;
  linkedin: string;
  industry: string;
  personalization: string;
  emailStatus: string;
  score: number;
  seniority: string;
  source: string;
  status: string;
  createdAt: string;
}

export interface ImportSummary {
  imported: number;
  skippedExisting: number;
  skippedNoEmail: number;
  contacts: string[];
  warning: string;
}

/** RFC-4180-ish CSV parser: quotes, escaped quotes, embedded commas and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function prospectsFromCsv(text: string): SellbirdProspect[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const get = (row: string[], name: string) => (idx(name) >= 0 ? (row[idx(name)] ?? "").trim() : "");
  return rows.slice(1).map((row) => ({
    email: get(row, "email"),
    firstName: get(row, "first_name"),
    lastName: get(row, "last_name"),
    company: get(row, "company_name"),
    title: get(row, "title"),
    website: get(row, "website"),
    linkedin: get(row, "linkedin_url"),
    industry: get(row, "industry"),
    personalization: get(row, "personalization"),
    emailStatus: get(row, "email_status"),
    score: Number(get(row, "score") || 0),
    seniority: get(row, "seniority"),
    source: get(row, "source"),
    status: get(row, "status"),
    createdAt: get(row, "created_at"),
  }));
}

export function contactInputFromProspect(p: SellbirdProspect, tenant: Tenant) {
  const email = p.email.trim().toLowerCase();
  return {
    firstName: p.firstName || "there",
    lastName: p.lastName || "",
    company: p.company || p.website || "Unknown company",
    trade: p.industry || tenant.trade,
    city: tenant.city,
    state: tenant.state,
    timezone: "America/Denver",
    phone: "",
    email,
    channelPreference: "email" as const,
    tags: ["sellbird", "needs_consent", p.industry || "unclassified"].filter(Boolean),
    notes: [
      p.title ? `Title: ${p.title}` : "",
      p.personalization ? `Sellbird note: ${p.personalization}` : "",
      p.website ? `Website: ${p.website}` : "",
      p.score ? `Sellbird score: ${p.score}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    pressureBudget: 0,
  };
}

export const SELLBIRD_WARNING =
  "Sellbird exports are cold prospects, not consented customers. They are imported with no marketing consent and a zero pressure budget, so the kernel will refuse to contact them until a human records a lawful basis. Use Sellbird for discovery and enrichment, not for sending.";

export interface ProofVideoJob {
  id: string;
  contactId: string;
  tool: "hyperframes";
  createdAt: string;
  durationSeconds: number;
  scene: string;
  script: string;
  claimIds: string[];
  status: "queued";
}

export function buildProofVideoJob(contact: Contact, now: string, claimIds: string[] = []): ProofVideoJob {
  const lost = contact.missedRevenuePerMonth || Math.round(contact.lostCallsPerMonth * contact.estimatedTicket * 0.2);
  return {
    id: `proof_${contact.id.slice(-8)}_${Date.parse(now).toString(36)}`,
    contactId: contact.id,
    tool: "hyperframes",
    createdAt: now,
    durationSeconds: 10,
    scene: "revenue-leak",
    script: [
      `Open on a phone ringing unanswered.`,
      `Cut to a calendar with ${contact.lostCallsPerMonth} empty slots.`,
      `Text: "${lost.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })} a month that never reaches the calendar."`,
      `Cut to a booked Tuesday. End card: "One 20-second check. That is the whole change."`,
    ].join(" "),
    claimIds,
    status: "queued",
  };
}
