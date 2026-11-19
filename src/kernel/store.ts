import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  ActionRecord,
  Channel,
  Claim,
  Consent,
  Contact,
  Decision,
  KernelSettings,
  Move,
  PolicyVerdict,
  Purpose,
  SignalType,
  Stage,
} from "../neuro/types.ts";
import { applySignal, decayField, deriveStage, priorField, readiness, bindingConstraint } from "../neuro/field.ts";
import { SIGNALS } from "../neuro/signals.ts";
import { DEFAULT_SETTINGS, evaluatePolicy, type ActionInput, type PolicyContext } from "./policy.ts";
import { EventLog, type KernelEvent } from "./events.ts";

export interface Tenant {
  name: string;
  trade: string;
  city: string;
  state: string;
  avgTicket: number;
  ownerName: string;
  ownerPhone: string;
  proof?: { name: string; city: string; result: string; action: string };
  reviewLink?: string;
}

export interface Reply {
  id: string;
  contactId: string;
  at: string;
  text: string;
  intent: string;
}

export interface Booking {
  id: string;
  contactId: string;
  at: string;
  slot: string;
  value: number;
  status: "held" | "confirmed" | "completed" | "no_show";
}

export interface BlockedAction {
  id: string;
  contactId: string;
  at: string;
  moveId: string;
  verdict: PolicyVerdict;
}

export interface KernelState {
  tenant: Tenant;
  contacts: Map<string, Contact>;
  actions: ActionRecord[];
  decisions: Decision[];
  replies: Reply[];
  bookings: Booking[];
  blocked: BlockedAction[];
}

export interface NewContactInput {
  firstName: string;
  lastName: string;
  company: string;
  trade?: string;
  city: string;
  state?: string;
  timezone?: string;
  phone: string;
  email: string;
  channelPreference?: Channel;
  estimatedTicket?: number;
  lostCallsPerMonth?: number;
  missedRevenuePerMonth?: number;
  vulnerable?: boolean;
  tags?: string[];
  notes?: string;
  createdAt?: string;
  pressureBudget?: number;
  pressureSpent?: number;
  doNotAskReview?: boolean;
}

const INBOUND_SIGNALS = new Set<SignalType>([
  "inbound_call",
  "form_fill",
  "reply_positive",
  "reply_question",
  "reply_objection_price",
  "reply_objection_time",
  "reply_objection_trust",
  "reply_not_now",
  "booking",
  "job_completed",
  "review_left",
  "complaint",
  "human_handoff",
  "purchase",
  "link_click",
]);

let idCounter = 0;
function rid(prefix: string): string {
  idCounter += 1;
  const stamp = Date.now().toString(36);
  return `${prefix}_${stamp}${idCounter.toString(36).padStart(3, "0")}`;
}

export function emptyState(tenant: Tenant): KernelState {
  return {
    tenant,
    contacts: new Map(),
    actions: [],
    decisions: [],
    replies: [],
    bookings: [],
    blocked: [],
  };
}

export const DEFAULT_TENANT: Tenant = {
  name: "Summit Ridge Roofing",
  trade: "roofing",
  city: "Denver",
  state: "CO",
  avgTicket: 14_500,
  ownerName: "Ray Salazar",
  ownerPhone: "+1 303-555-0142",
  proof: {
    name: "Alvarez Roofing",
    city: "Lakewood",
    result: "They booked 11 additional jobs in the first six weeks",
    action: "a 20-second Google profile check before every callback",
  },
  reviewLink: "https://g.page/r/summit-ridge-roofing/review",
};

export function newContact(input: NewContactInput, tenant: Tenant, at: string): Contact {
  return {
    id: rid("ct"),
    firstName: input.firstName,
    lastName: input.lastName,
    company: input.company,
    trade: input.trade ?? tenant.trade,
    city: input.city,
    state: input.state ?? tenant.state,
    timezone: input.timezone ?? "America/Denver",
    phone: input.phone,
    email: input.email,
    channelPreference: input.channelPreference ?? "sms",
    stage: "dormant",
    field: priorField(at),
    consent: [],
    optedOut: false,
    vulnerable: input.vulnerable ?? false,
    doNotAskReview: input.doNotAskReview ?? false,
    pressureSpent: input.pressureSpent ?? 0,
    pressureBudget: input.pressureBudget ?? 3,
    outboundLog: [],
    outboundCount24h: 0,
    outboundCount7d: 0,
    outboundCount30d: 0,
    estimatedTicket: input.estimatedTicket ?? tenant.avgTicket,
    lostCallsPerMonth: input.lostCallsPerMonth ?? 9,
    missedRevenuePerMonth: input.missedRevenuePerMonth ?? 0,
    createdAt: input.createdAt ?? at,
    updatedAt: at,
    tags: input.tags ?? [],
    notes: input.notes,
  };
}

function countSince(log: string[], now: string, hours: number): number {
  const t = Date.parse(now);
  return log.filter((iso) => t - Date.parse(iso) <= hours * 3_600_000).length;
}

function cloneContact(contact: Contact): Contact {
  return {
    ...contact,
    field: { ...contact.field, evidence: [...contact.field.evidence] },
    consent: contact.consent.map((c) => ({ ...c })),
    outboundLog: [...contact.outboundLog],
    tags: [...contact.tags],
  };
}

/**
 * Pure reducer. Replaying the log from GENESIS reproduces state exactly.
 */
export function reduce(state: KernelState, event: KernelEvent): void {
  const p = event.payload as Record<string, any>;
  switch (event.type) {
    case "tenant.configured": {
      state.tenant = { ...state.tenant, ...(p.tenant as Partial<Tenant>) };
      return;
    }
    case "contact.created": {
      const contact = p.contact as Contact;
      state.contacts.set(contact.id, structuredClone(contact));
      return;
    }
    case "signal.recorded": {
      const contact = state.contacts.get(p.contactId as string);
      if (!contact) return;
      const def = SIGNALS[p.signal as SignalType];
      if (!def) return;
      contact.field = decayField(contact.field, event.at);
      contact.field = applySignal(contact.field, def, event.at, (p.strength as number) ?? 1);
      contact.field.evidence = [
        ...contact.field.evidence,
        { kind: "event", id: event.id, note: `${def.label}${p.detail ? `: ${p.detail}` : ""}` },
      ].slice(-16);
      contact.updatedAt = event.at;
      if (INBOUND_SIGNALS.has(p.signal as SignalType)) contact.lastInboundAt = event.at;
      contact.lastSignal = { type: p.signal as SignalType, at: event.at };
      return;
    }
    case "contact.updated": {
      const contact = state.contacts.get(p.contactId as string);
      if (!contact) return;
      Object.assign(contact, p.patch as Partial<Contact>);
      contact.updatedAt = event.at;
      return;
    }
    case "consent.changed": {
      const contact = state.contacts.get(p.contactId as string);
      if (!contact) return;
      const consent = p.consent as Consent;
      const idx = contact.consent.findIndex((c) => c.purpose === consent.purpose && c.channel === consent.channel);
      if (idx >= 0) contact.consent[idx] = consent;
      else contact.consent.push(consent);
      contact.updatedAt = event.at;
      return;
    }
    case "decision.made": {
      state.decisions.push(p.decision as Decision);
      return;
    }
    case "action.sent": {
      const action = p.action as ActionRecord;
      state.actions.push(action);
      const contact = state.contacts.get(action.contactId);
      if (contact) {
        contact.pressureSpent = Number((contact.pressureSpent + action.pressure).toFixed(3));
        contact.outboundLog.push(event.at);
        contact.lastOutboundAt = event.at;
        contact.outboundCount24h = countSince(contact.outboundLog, event.at, 24);
        contact.outboundCount7d = countSince(contact.outboundLog, event.at, 24 * 7);
        contact.outboundCount30d = countSince(contact.outboundLog, event.at, 24 * 30);
        contact.updatedAt = event.at;
      }
      return;
    }
    case "action.blocked": {
      state.blocked.push({
        id: event.id,
        contactId: p.contactId as string,
        at: event.at,
        moveId: p.moveId as string,
        verdict: p.verdict as PolicyVerdict,
      });
      return;
    }
    case "reply.received": {
      const contact = state.contacts.get(p.contactId as string);
      state.replies.push({
        id: event.id,
        contactId: p.contactId as string,
        at: event.at,
        text: p.text as string,
        intent: p.intent as string,
      });
      if (contact) {
        contact.lastInboundAt = event.at;
        contact.updatedAt = event.at;
      }
      return;
    }
    case "booking.created": {
      state.bookings.push({
        id: event.id,
        contactId: p.contactId as string,
        at: event.at,
        slot: (p.slot as string) ?? "",
        value: (p.value as number) ?? 0,
        status: "held",
      });
      return;
    }
    case "booking.updated": {
      const booking = state.bookings.find((b) => b.id === p.bookingId);
      if (booking) booking.status = p.status as Booking["status"];
      return;
    }
    case "human.handoff": {
      const contact = state.contacts.get(p.contactId as string);
      if (contact) {
        contact.stage = "human";
        contact.updatedAt = event.at;
      }
      return;
    }
    case "contact.opted_out": {
      const contact = state.contacts.get(p.contactId as string);
      if (contact) {
        contact.optedOut = true;
        contact.optedOutAt = event.at;
        contact.stage = "exited";
        contact.updatedAt = event.at;
      }
      return;
    }
    case "claim.added": {
      // Claims are configuration; the reducer is a no-op so replay stays honest.
      return;
    }
    default:
      return;
  }
}

export class KernelStore {
  state: KernelState;
  log: EventLog;
  settings: KernelSettings;
  claims: Claim[];
  dataDir?: string;

  constructor(options: {
    tenant?: Tenant;
    dataDir?: string;
    settings?: KernelSettings;
    claims?: Claim[];
    persist?: boolean;
  } = {}) {
    const tenant = options.tenant ?? DEFAULT_TENANT;
    this.state = emptyState(tenant);
    this.settings = options.settings ?? DEFAULT_SETTINGS;
    this.claims = options.claims ?? [];
    this.dataDir = options.dataDir;
    const file = options.dataDir && options.persist !== false ? `${options.dataDir}/events.jsonl` : undefined;
    this.log = new EventLog(file);
    if (this.log.events.length > 0) this.replay();
  }

  /** Re-read the log from disk. The caller must guarantee no concurrent writer. */
  reloadFromDisk(): boolean {
    if (!this.dataDir) return false;
    const file = join(this.dataDir, "events.jsonl");
    if (!existsSync(file)) return false;
    this.log.load(file);
    this.replay();
    return true;
  }

  replay(): void {
    this.state = emptyState(this.state.tenant);
    for (const event of this.log.events) reduce(this.state, event);
  }

  emit(
    type: string,
    at: string,
    payload: Record<string, unknown>,
    contactId?: string,
    actor = "kernel",
  ): KernelEvent {
    const event = this.log.append(type, at, payload, actor, contactId);
    reduce(this.state, event);
    return event;
  }

  configureTenant(tenant: Partial<Tenant>, at: string): void {
    this.emit("tenant.configured", at, { tenant });
  }

  createContact(input: NewContactInput, at: string): Contact {
    const contact = newContact(input, this.state.tenant, at);
    this.emit("contact.created", at, { contact }, contact.id, "seed");
    return contact;
  }

  recordSignal(
    contactId: string,
    signal: SignalType,
    at: string,
    source: string,
    detail?: string,
    strength = 1,
  ): void {
    this.emit("signal.recorded", at, { contactId, signal, source, detail, strength }, contactId, source);
  }

  recordDecision(decision: Decision): void {
    this.emit("decision.made", decision.at, { decision }, decision.contactId, "conductor");
  }

  recordAction(action: ActionRecord): void {
    this.emit("action.sent", action.at, { action }, action.contactId, action.roleId);
  }

  recordBlocked(contactId: string, moveId: string, verdict: PolicyVerdict, at: string): void {
    this.emit("action.blocked", at, { contactId, moveId, verdict }, contactId, "policy");
  }

  recordReply(contactId: string, text: string, intent: string, at: string): void {
    this.emit("reply.received", at, { contactId, text, intent }, contactId, "contact");
  }

  recordConsent(contactId: string, consent: Consent, at: string): void {
    this.emit("consent.changed", at, { contactId, consent }, contactId, consent.source);
  }

  optOut(contactId: string, at: string, reason: string): void {
    this.emit("contact.opted_out", at, { contactId, reason }, contactId, "contact");
  }

  createBooking(contactId: string, slot: string, value: number, at: string): Booking {
    const event = this.emit("booking.created", at, { contactId, slot, value }, contactId, "conductor");
    return this.state.bookings.find((b) => b.id === event.id)!;
  }

  handoff(contactId: string, at: string, note: string): void {
    this.emit("human.handoff", at, { contactId, note }, contactId, "conductor");
  }

  getContact(id: string): Contact | undefined {
    return this.state.contacts.get(id);
  }

  contacts(): Contact[] {
    return [...this.state.contacts.values()];
  }

  outboundCounts(contactId: string, now: string): { h24: number; d7: number; d30: number } {
    const contact = this.getContact(contactId);
    if (!contact) return { h24: 0, d7: 0, d30: 0 };
    return {
      h24: countSince(contact.outboundLog, now, 24),
      d7: countSince(contact.outboundLog, now, 24 * 7),
      d30: countSince(contact.outboundLog, now, 24 * 30),
    };
  }

  localHour(contact: Contact, now: string): number {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: contact.timezone,
      hour: "2-digit",
      hourCycle: "h23",
    });
    return Number(fmt.format(new Date(now)));
  }

  policyContext(contact: Contact, action: ActionInput, now: string): PolicyContext {
    return {
      contact,
      now,
      localHour: this.localHour(contact, now),
      claims: this.claims,
      settings: this.settings,
      action,
      outbound: this.outboundCounts(contact.id, now),
    };
  }

  evaluate(contact: Contact, action: ActionInput, now: string): PolicyVerdict {
    return evaluatePolicy(this.policyContext(contact, action, now));
  }

  metrics(now: string) {
    const contacts = this.contacts();
    const staged = contacts.map((c) => ({ contact: c, stage: deriveStage(c, c.field, now) }));
    const active = staged.filter((s) => s.stage !== "exited" && s.stage !== "paused");
    const booked = this.state.bookings.length;
    const optOuts = contacts.filter((c) => c.optedOut).length;
    const revenue = this.state.bookings.reduce((sum, b) => sum + b.value, 0);
    return {
      tenant: this.state.tenant,
      contacts: contacts.length,
      active: active.length,
      ready: contacts.filter((c) => readiness(c.field) >= 0.55).length,
      committed: staged.filter((s) => s.stage === "committed" || s.stage === "sustained").length,
      actions: this.state.actions.length,
      decisions: this.state.decisions.length,
      blocked: this.state.blocked.reduce(
        (acc, b) => {
          for (const issue of b.verdict.issues) {
            if (issue.severity === "block") acc[issue.code] = (acc[issue.code] ?? 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>,
      ),
      bookings: booked,
      optOuts,
      revenue,
      events: this.log.events.length,
      chainOk: this.log.verify().ok,
      at: now,
    };
  }

  portfolio(now: string) {
    return this.contacts()
      .map((c) => {
        const field = decayField(c.field, now);
        const binding = bindingConstraint(field);
        return {
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          firstName: c.firstName,
          lastName: c.lastName,
          company: c.company,
          city: c.city,
          trade: c.trade,
          stage: deriveStage(c, field, now),
          optedOut: c.optedOut,
          vulnerable: c.vulnerable,
          channel: c.channelPreference,
          readiness: Number(readiness(field).toFixed(3)),
          binding: binding.dimension,
          bindingDeficit: binding.deficit,
          pressureSpent: Number(c.pressureSpent.toFixed(2)),
          pressureBudget: c.pressureBudget,
          lastTouch: c.lastInboundAt ?? c.lastOutboundAt ?? null,
          ticket: c.estimatedTicket,
          tags: c.tags,
        };
      })
      .sort((a, b) => b.readiness - a.readiness);
  }

  hydrateContact(id: string, now: string) {
    const c = this.getContact(id);
    if (!c) return null;
    const field = decayField(c.field, now);
    const connection = this.claims.filter((claim) => !claim.segment || claim.segment === "*" || claim.segment === c.trade);
    return {
      ...c,
      field,
      stage: deriveStage(c, field, now),
      readiness: Number(readiness(field).toFixed(3)),
      binding: bindingConstraint(field),
      consentSummary: c.consent.map((x) => `${x.purpose}/${x.channel}:${x.granted ? "yes" : "no"}`),
      availableClaims: connection.map((x) => ({ id: x.id, text: x.text, segment: x.segment })),
    };
  }
}

/** Placeholder used by the console when a contact has no stage yet. */
export function stageRank(stage: Stage): number {
  const order: Stage[] = [
    "dormant",
    "signal",
    "open",
    "trusted",
    "framed",
    "proven",
    "committed",
    "sustained",
  ];
  const idx = order.indexOf(stage);
  return idx === -1 ? 0 : idx;
}

export function moveById(moves: Move[], id: string): Move | undefined {
  return moves.find((m) => m.id === id);
}

export function purposeOf(move: Move): Purpose {
  return move.purpose;
}
