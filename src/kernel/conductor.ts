import type {
  ActionRecord,
  Channel,
  Claim,
  Contact,
  Decision,
  KernelSettings,
  RenderFacts,
  SignalType,
} from "../neuro/types.ts";
import { readiness } from "../neuro/field.ts";
import { armFor, experimentId, holdoutPercent } from "./experiment.ts";
import { plan, type PlanResult } from "./scheduler.ts";
import type { KernelStore } from "./store.ts";

export type Intent =
  | "stop"
  | "book"
  | "price"
  | "time"
  | "trust"
  | "question"
  | "positive"
  | "negative"
  | "unknown";

const INTENT_PATTERNS: Array<{ intent: Intent; re: RegExp; signal: SignalType }> = [
  { intent: "stop", re: /\b(?:stop|unsubscribe|remove me|opt out|do not contact|don'?t contact|leave me alone|no more (?:texts?|emails?|calls?))\b/i, signal: "reply_not_now" },
  { intent: "book", re: /\b(?:book|schedule|tuesday|thursday|works for me|that works|let'?s do it|sign me up|yes,? (?:please|let'?s)|confirm)\b/i, signal: "booking" },
  { intent: "price", re: /\b(?:price|pricing|cost|expensive|how much|afford|budget|\$\d)\b/i, signal: "reply_objection_price" },
  { intent: "time", re: /\b(?:busy|no time|next month|later|after the holidays|not (?:right )?now|too soon)\b/i, signal: "reply_not_now" },
  { intent: "trust", re: /\b(?:scam|trust|legit|proof|reviews?|really|robot|is this ai|are you ai|guarantee)\b/i, signal: "reply_objection_trust" },
  { intent: "positive", re: /\b(?:interested|tell me more|send it|send me|sounds good|okay|ok|sure|yes)\b/i, signal: "reply_positive" },
  { intent: "negative", re: /\b(?:no thanks|not interested|pass|no)\b/i, signal: "reply_not_now" },
  { intent: "question", re: /\?/, signal: "reply_question" },
];

export function classifyReply(text: string): { intent: Intent; signal: SignalType; confidence: number } {
  const cleaned = text.trim();
  for (const { intent, re, signal } of INTENT_PATTERNS) {
    if (re.test(cleaned)) return { intent, signal, confidence: 0.8 };
  }
  return { intent: "unknown", signal: "reply_question", confidence: 0.3 };
}

export interface DispatchResult {
  plan: PlanResult;
  action?: ActionRecord;
  blocked?: boolean;
}

export interface ReplyResult {
  intent: Intent;
  reply: string;
  plan?: PlanResult;
  action?: ActionRecord;
  optedOut: boolean;
}

/**
 * The conductor is the only place that mutates state. It ties the field
 * estimate, the scheduler, the renderer and the policy engine together, and
 * writes every decision — including "do nothing" — into the log.
 */
export class Conductor {
  store: KernelStore;
  claims: Claim[];
  settings: KernelSettings;
  facts?: Partial<RenderFacts>;

  constructor(store: KernelStore, claims: Claim[], settings: KernelSettings) {
    this.store = store;
    this.claims = claims;
    this.settings = settings;
  }

  /** The server refreshes real calendar slots once per request; every nested plan sees them. */
  setFacts(facts?: Partial<RenderFacts>): void {
    this.facts = facts;
  }

  planFor(contactId: string, now: string, options: { roleId?: string; channel?: Channel; initiatedBy?: "system" | "human" | "inbound" } = {}): PlanResult | null {
    const contact = this.store.getContact(contactId);
    if (!contact) return null;
    if (options.initiatedBy !== "inbound" && armFor(contact.id, holdoutPercent(), experimentId()) === "holdout") {
      return null;
    }
    return plan({
      contact,
      now,
      claims: this.claims,
      settings: this.settings,
      outbound: this.store.outboundCounts(contactId, now),
      localHour: this.store.localHour(contact, now),
      tenant: this.store.state.tenant,
      roleId: options.roleId,
      channel: options.channel,
      initiatedBy: options.initiatedBy,
      facts: this.facts,
    });
  }

  dispatch(contactId: string, now: string, options: { roleId?: string; channel?: Channel; initiatedBy?: "system" | "human" | "inbound" } = {}): DispatchResult | null {
    const result = this.planFor(contactId, now, options);
    if (!result) return null;

    this.store.recordDecision(result.decision);

    if (result.move.id === "wait" || !result.verdict.allowed) {
      if (!result.verdict.allowed) {
        this.store.recordBlocked(contactId, result.move.id, result.verdict, now);
      }
      return { plan: result, blocked: !result.verdict.allowed };
    }

    const action: ActionRecord = {
      id: `act_${result.decision.id.slice(4)}`,
      contactId,
      at: now,
      moveId: result.move.id,
      roleId: result.role.id,
      channel: result.channel,
      purpose: result.move.purpose,
      body: result.message.body,
      subject: result.message.subject,
      claimIds: result.message.claimIds,
      pressure: result.move.pressure,
      policy: result.verdict,
      decision: result.decision,
    };
    this.store.recordAction(action);
    return { plan: result, action };
  }

  handleReply(contactId: string, text: string, now: string, channel?: Channel): ReplyResult | null {
    const contact = this.store.getContact(contactId);
    if (!contact) return null;
    const { intent, signal } = classifyReply(text);

    this.store.recordReply(contactId, text, intent, now);
    this.store.recordSignal(contactId, signal, now, "contact", text.slice(0, 120));

    if (intent === "stop") {
      this.store.optOut(contactId, now, "reply: STOP");
      return {
        intent,
        optedOut: true,
        reply: "You're off the list. No further messages. If you ever want the numbers, they're here.",
      };
    }

    if (intent === "book") {
      const slot = parseSlot(text, now, contact.timezone);
      this.store.createBooking(contactId, slot, contact.estimatedTicket, now);
      const confirmation = this.dispatch(contactId, now, { roleId: "concierge", initiatedBy: "inbound", channel: channel ?? contact.channelPreference });
      return {
        intent,
        optedOut: false,
        plan: confirmation?.plan,
        action: confirmation?.action,
        reply: confirmation?.action?.body ?? `You're set for ${slot}. A person will confirm from ${this.store.state.tenant.ownerPhone}.`,
      };
    }

    const result = this.dispatch(contactId, now, {
      roleId: intent === "trust" || intent === "price" ? "reviver" : "concierge",
      initiatedBy: "inbound",
      channel: channel ?? contact.channelPreference,
    });

    return {
      intent,
      optedOut: false,
      plan: result?.plan,
      action: result?.action,
      reply: result?.action?.body ?? "Got it. I've logged this and a person will follow up.",
    };
  }

  /** Decide who gets attention now. The OS is allowed to leave people alone. */
  tick(now: string, limit = 4): DispatchResult[] {
    const ranked = this.store
      .contacts()
      .filter((c) => !c.optedOut && c.stage !== "exited")
      .map((c) => {
        const r = readiness(c.field);
        return { contact: c, priority: r * c.estimatedTicket + (c.lastInboundAt ? 4_000 : 0) };
      })
      .sort((a, b) => b.priority - a.priority)
      .slice(0, limit);

    const out: DispatchResult[] = [];
    for (const { contact } of ranked) {
      const result = this.dispatch(contact.id, now);
      if (result) out.push(result);
    }
    return out;
  }

  explain(contactId: string, now: string): {
    contact: Contact;
    plan: PlanResult;
    readiness: number;
    remainingPressure: number;
  } | null {
    const contact = this.store.getContact(contactId);
    const planResult = this.planFor(contactId, now);
    if (!contact || !planResult) return null;
    return {
      contact,
      plan: planResult,
      readiness: Number(readiness(contact.field).toFixed(3)),
      remainingPressure: Number((contact.pressureBudget - contact.pressureSpent).toFixed(2)),
    };
  }
}

function parseSlot(text: string, now: string, timezone: string): string {
  const base = new Date(Date.parse(now) + 2 * 86_400_000);
  base.setUTCHours(16, 0, 0, 0);
  if (/\bthu/i.test(text)) base.setUTCDate(base.getUTCDate() + 2);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(base);
  return label;
}

export function summarizePlan(decision: Decision, contact: Contact): string {
  return `${contact.firstName}: ${decision.moveId} (${decision.deltaReadiness} pts, ${decision.binding} constraint)`;
}
