import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Append-only, hash-chained event log.
 *
 * Every state change is an event. Every event commits to the one before it, so
 * tampering with history is detectable without a database. This is the audit
 * trail a client can actually be shown.
 */
export interface KernelEvent {
  seq: number;
  id: string;
  at: string;
  type: string;
  contactId?: string;
  actor: string;
  payload: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = prune(v);
    }
    return out;
  }
  return value;
}

function digest(event: Omit<KernelEvent, "hash">): string {
  return createHash("sha256")
    .update(
      stableStringify({
        seq: event.seq,
        id: event.id,
        at: event.at,
        type: event.type,
        contactId: event.contactId ?? null,
        actor: event.actor,
        payload: event.payload,
        prevHash: event.prevHash,
      }),
    )
    .digest("hex");
}

export class EventLog {
  events: KernelEvent[] = [];
  private filePath?: string;

  constructor(filePath?: string) {
    this.filePath = filePath;
    if (filePath && existsSync(filePath)) this.load(filePath);
  }

  get lastHash(): string {
    return this.events.at(-1)?.hash ?? "GENESIS";
  }

  append(
    type: string,
    at: string,
    payload: Record<string, unknown>,
    actor = "kernel",
    contactId?: string,
  ): KernelEvent {
    const cleanPayload = prune(payload) as Record<string, unknown>;
    const base: Omit<KernelEvent, "hash"> = {
      seq: this.events.length + 1,
      id: `evt_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
      at,
      type,
      contactId,
      actor,
      payload: cleanPayload,
      prevHash: this.lastHash,
    };
    const event: KernelEvent = { ...base, hash: digest(base) };
    this.events.push(event);
    if (this.filePath) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
    }
    return event;
  }

  load(filePath: string): void {
    const raw = readFileSync(filePath, "utf8");
    this.events = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as KernelEvent);
    this.filePath = filePath;
  }

  verify(): { ok: boolean; count: number; brokenAt?: number; reason?: string } {
    let prev = "GENESIS";
    for (const event of this.events) {
      if (event.prevHash !== prev) {
        return { ok: false, count: this.events.length, brokenAt: event.seq, reason: "prevHash mismatch" };
      }
      const recomputed = digest({ ...event, hash: undefined } as unknown as Omit<KernelEvent, "hash">);
      if (recomputed !== event.hash) {
        return { ok: false, count: this.events.length, brokenAt: event.seq, reason: "hash mismatch" };
      }
      prev = event.hash;
    }
    return { ok: true, count: this.events.length };
  }

  tail(limit = 50): KernelEvent[] {
    return this.events.slice(Math.max(0, this.events.length - limit));
  }

  writeSnapshot(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.events, null, 2), "utf8");
  }
}
