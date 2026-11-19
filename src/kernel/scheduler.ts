import type {
  Claim,
  Contact,
  Decision,
  Dimension,
  Move,
  PolicyVerdict,
  RenderedMessage,
  RenderFacts,
  RoleDefinition,
  Stage,
  Channel,
} from "../neuro/types.ts";
import { MOVES, mutabilityFrom } from "../neuro/moves.ts";
import { bindingConstraint, decayField, deriveStage, projectField, readiness } from "../neuro/field.ts";
import { evaluatePolicy } from "./policy.ts";
import type { KernelSettings } from "../neuro/types.ts";
import { ROLES, toneFor } from "../roles/registry.ts";
import { factsFor, renderMessage } from "../render/renderer.ts";
import type { Tenant } from "./store.ts";

export interface PlanInput {
  contact: Contact;
  now: string;
  claims: import("../neuro/types.ts").Claim[];
  settings: KernelSettings;
  outbound: { h24: number; d7: number; d30: number };
  localHour: number;
  tenant: Tenant;
  roleId?: string;
  channel?: Channel;
  initiatedBy?: "system" | "human" | "inbound";
  facts?: Partial<RenderFacts>;
}

export interface PlanResult {
  decision: Decision;
  move: Move;
  role: RoleDefinition;
  channel: Channel;
  message: RenderedMessage;
  verdict: PolicyVerdict;
  field: Contact["field"];
}

let counter = 0;
function decisionId(): string {
  counter += 1;
  return `dec_${Date.now().toString(36)}${counter.toString(36).padStart(3, "0")}`;
}

function stageBonus(move: Move, stage: Stage, contact: Contact): number {
  let bonus = 0;
  if (move.id === "confirm" && (stage === "committed" || stage === "sustained")) bonus += 1.6;
  if (move.id === "calendar_hold" && (stage === "framed" || stage === "proven")) bonus += 0.8;
  if (move.id === "micro_commit" && stage === "open") bonus += 0.2;
  if (move.id === "local_proof" && contact.field.trust < 0.5) bonus += 0.6;
  if (move.id === "objection_answer" && contact.tags.some((t) => t.startsWith("objection"))) bonus += 0.9;
  if (move.id === "review_request" && contact.tags.includes("job_complete")) bonus += 1.2;
  if (move.id === "name_real_loss" && contact.field.safety >= 0.55 && contact.field.anticipation < 0.45) bonus += 0.7;
  if (move.id === "give_control" && contact.pressureSpent > 0.6) bonus += 0.7;
  if (move.id === "human_bridge" && contact.stage === "human") bonus += 2;
  return bonus;
}

function channelScore(channel: Channel, contact: Contact): number {
  if (channel === contact.channelPreference) return 0.25;
  if (channel === "email" && contact.channelPreference !== "email") return 0;
  return 0.1;
}

function consentFor(contact: Contact, move: Move, channel: Channel, now: string): boolean {
  if (move.purpose === "marketing") {
    return contact.consent.some(
      (c) =>
        c.granted &&
        c.channel === channel &&
        (c.purpose === "marketing" || c.purpose === move.purpose) &&
        (!c.expiresAt || Date.parse(c.expiresAt) > Date.parse(now)),
    );
  }
  if (move.purpose === "review") {
    return contact.consent.some(
      (c) => c.granted && c.channel === channel && c.purpose === "review" && (!c.expiresAt || Date.parse(c.expiresAt) > Date.parse(now)),
    );
  }
  return true;
}

function intentBonus(move: Move, contact: Contact, stage: Stage): number {
  const tags = contact.tags;
  let b = 0;
  if (tags.some((t) => t.startsWith("objection_")) && move.id === "objection_answer") b += 12;
  if (tags.includes("not_now")) {
    if (move.id === "close_loop") b += 12;
    if (move.id === "give_control") b += 2;
    if (["local_proof", "name_real_loss", "calendar_hold", "micro_commit"].includes(move.id)) b -= 8;
  }
  if (tags.includes("high_intent")) {
    if (move.id === "calendar_hold" || move.id === "plain_next_step") b += 8;
    if (move.id === "local_proof" || move.id === "warm_open") b -= 4;
  }
  if (tags.includes("vulnerable")) {
    if (move.id === "escalate_human") b += 20;
    if (move.id !== "escalate_human" && move.id !== "human_bridge") b -= 6;
  }
  if (tags.includes("missed_call") || contact.lastSignal?.type === "missed_call") {
    if (move.id === "warm_open" || move.id === "human_bridge") b += 5;
  }
  if (tags.includes("complaint") || contact.lastSignal?.type === "complaint") {
    if (move.id === "escalate_human") b += 10;
  }
  if (tags.includes("job_complete") && move.id === "review_request") b += 6;
  if (stage === "committed" && move.id === "confirm") b += 8;
  if (stage === "sustained") {
    if (contact.doNotAskReview && move.id === "close_loop") b += 10;
    if (contact.doNotAskReview && move.id === "escalate_human") b -= 8;
  }
  if (move.id === "escalate_human" && stage !== "human" && !tags.includes("vulnerable") && !tags.includes("complaint")) {
    b -= 8;
  }
  if (tags.includes("seasonal") && move.id === "future_pace") b += 3;
  return b;
}

function chooseRole(contact: Contact, stage: Stage, requested?: string): RoleDefinition {
  if (requested && ROLES[requested]) return ROLES[requested];
  if (contact.vulnerable) return ROLES.concierge;
  if (stage === "sustained") return ROLES.advocate;
  if (stage === "committed") return ROLES.advocate;
  if (stage === "human") return ROLES.concierge;
  return ROLES.reviver;
}

function chooseChannel(contact: Contact, move: Move, role: RoleDefinition, now: string, explicit?: Channel): Channel | null {
  const allowed = (["sms", "email", "voice", "web"] as Channel[]).filter(
    (ch) => move.channels.includes(ch) && role.channels.includes(ch),
  );
  if (explicit && allowed.includes(explicit) && consentFor(contact, move, explicit, now)) return explicit;
  const preferred = allowed.includes(contact.channelPreference) ? contact.channelPreference : allowed[0];
  if (preferred && consentFor(contact, move, preferred, now)) return preferred;
  for (const ch of allowed) if (consentFor(contact, move, ch, now)) return ch;
  return null;
}

function slots(now: string, timezone: string): { a: string; b: string; deadline: string } {
  const base = new Date(Date.parse(now) + 2 * 86_400_000);
  base.setUTCHours(16, 0, 0, 0); // 9:00 in Denver during standard time
  const a = base.toISOString();
  const b = new Date(base.getTime() + 2 * 86_400_000 + 6.5 * 3_600_000).toISOString();
  const label = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  return { a: label(a), b: label(b), deadline: a };
}

/**
 * The scheduler is the whole thesis in one function: find the move that buys
 * the most real readiness for the least pressure, or do nothing.
 */
export function plan(input: PlanInput): PlanResult {
  const { contact, now, tenant } = input;
  const field = decayField(contact.field, now);
  const stage = deriveStage(contact, field, now);
  const role = chooseRole(contact, stage, input.roleId);
  const initiatedBy = input.initiatedBy ?? "system";

  if (contact.optedOut || stage === "exited") {
    const wait = MOVES.wait;
    return {
      decision: {
        id: decisionId(),
        contactId: contact.id,
        at: now,
        moveId: "wait",
        score: 0,
        deltaReadiness: 0,
        readinessBefore: readiness(field),
        readinessAfter: readiness(field),
        binding: "trust",
        bindingDeficit: 1 - field.trust,
        system: "deliberative",
        whyNow: "Contact has exited. The only correct action is none.",
        alternatives: [],
        roleId: role.id,
        channel: contact.channelPreference,
        pressure: 0,
      },
      move: wait,
      role,
      channel: contact.channelPreference,
      message: { body: "", claimIds: [] },
      verdict: { allowed: true, issues: [], checkedAt: now },
      field,
    };
  }

  const legalRoleMoves = role.moves
    .map((id) => MOVES[id])
    .filter((m): m is Move => Boolean(m) && m.id !== "wait" && m.minStage.includes(stage))
    .filter((m) =>
      stage === "human" ? ["escalate_human", "human_bridge", "give_control"].includes(m.id) : true,
    );

  const mutability = mutabilityFrom(legalRoleMoves);
  const tags = contact.tags;
  const eligible: Dimension[] | undefined =
    stage === "human" || tags.includes("complaint")
      ? ["safety", "trust"]
      : stage === "committed"
        ? ["clarity", "trust", "commitment"]
        : stage === "sustained"
          ? ["trust", "commitment", "clarity"]
          : tags.includes("not_now")
          ? ["agency", "safety"]
          : tags.includes("high_intent")
            ? ["clarity", "anticipation", "commitment"]
            : tags.some((t) => t.startsWith("objection_"))
              ? ["clarity", "trust"]
              : undefined;
  const binding = bindingConstraint(field, mutability, eligible);
  const before = readiness(field);

  const verdicts: Array<{
    move: Move;
    channel: Channel;
    after: number;
    delta: number;
    score: number;
    intent: number;
    verdict: PolicyVerdict;
    message: RenderedMessage;
    blocked?: string;
  }> = [];

  const baseFacts = factsFor(contact, tenant, input.facts);
  const proofAvailable = Boolean(baseFacts.proof);

  for (const move of legalRoleMoves) {
    const channel = chooseChannel(contact, move, role, now, input.channel);
    if (!channel) continue;

    const facts = { ...baseFacts };
    if (move.id === "calendar_hold") {
      const s = slots(now, contact.timezone);
      facts.slotA = facts.slotA ?? s.a;
      facts.slotB = facts.slotB ?? s.b;
    }
    const attached = attachClaims(move, contact, input.claims, now);
    if (attached) {
      facts.claimIds = [attached.id];
      facts.claimText = attached.text;
    }
    const message = renderMessage(move, channel, {
      skin: toneFor(role),
      sender: baseFacts.sender ?? tenant.name,
      company: tenant.name,
    }, facts);

    const realDeadline = move.id === "calendar_hold" ? (facts.deadline ?? slots(now, contact.timezone).deadline) : undefined;
    const verdict = evaluatePolicy({
      contact: { ...contact, field },
      now,
      localHour: input.localHour,
      claims: input.claims,
      settings: input.settings,
      outbound: input.outbound,
      action: {
        move,
        channel,
        purpose: move.purpose,
        body: `${message.subject ?? ""} ${message.body}`.trim(),
        claimIds: message.claimIds,
        initiatedBy,
        isFirstContact: contact.outboundLog.length === 0,
        realDeadline,
        proofSegment: proofAvailable ? contact.trade : undefined,
        reviewAudience: "all_completed",
        allowedNumbers: [
          contact.estimatedTicket,
          baseFacts.missedRevenue,
          contact.lostCallsPerMonth,
          Number(contact.phone.replace(/\D/g, "")),
          ...contact.phone.split(/\D+/).filter(Boolean).map(Number),
          Number(tenant.ownerPhone.replace(/\D/g, "")),
          ...tenant.ownerPhone.split(/\D+/).filter(Boolean).map(Number),
        ],
        roleAutonomy: role.autonomy,
      },
    });

    const after = readiness(projectField(field, move, now));
    const delta = after - before;
    const alignment = move.gains[binding.dimension] ?? 0;
    const intent = intentBonus(move, contact, stage);
    const score =
      delta * 80 +
      alignment * 15 +
      intent +
      stageBonus(move, stage, contact) +
      channelScore(channel, contact) -
      move.pressure * (0.35 + contact.pressureSpent * 0.18);

    verdicts.push({ move, channel, after, delta, score, intent, verdict, message, blocked: verdict.allowed ? undefined : verdict.issues.find((i) => i.severity === "block")?.rule });
  }

  verdicts.sort((a, b) => b.score - a.score);
  const viable = verdicts.filter((v) => !v.blocked);
  const best = viable[0];

  const alternatives = verdicts.slice(0, 5).map((v) => ({
    moveId: v.move.id,
    score: Number(v.score.toFixed(3)),
    deltaReadiness: Number((v.delta * 100).toFixed(2)),
    blocked: v.blocked,
  }));

  if (!best || best.score < 1.4) {
    const wait = MOVES.wait;
    return {
      decision: {
        id: decisionId(),
        contactId: contact.id,
        at: now,
        moveId: "wait",
        score: best?.score ?? 0,
        deltaReadiness: 0,
        readinessBefore: before,
        readinessAfter: before,
        binding: binding.dimension,
        bindingDeficit: binding.deficit,
        system: "deliberative",
        whyNow: best
          ? `Best available move scored ${best.score.toFixed(2)}, below the 1.40 action floor. The OS does not spend attention to move a number it cannot move enough.`
          : `No legal move for stage ${stage}: every candidate was blocked or lacked consent.`,
        alternatives,
        roleId: role.id,
        channel: contact.channelPreference,
        pressure: 0,
      },
      move: wait,
      role,
      channel: contact.channelPreference,
      message: { body: "", claimIds: [] },
      verdict: { allowed: true, issues: [], checkedAt: now },
      field,
    };
  }

  const whyNow =
    best.intent >= 4
      ? `${best.move.label} is indicated by the latest signal: ${best.move.intent} It still has to clear the rails, and it does. Binding constraint: ${binding.dimension} (${(binding.deficit * 100).toFixed(0)} point gap). ${describeBudget(contact)}`
      : `${capitalize(binding.dimension)} is the binding constraint (${(binding.deficit * 100).toFixed(0)} point gap). ${best.move.label} is the highest-yield legal move: +${(best.delta * 100).toFixed(1)} readiness points for ${best.move.pressure.toFixed(2)} pressure. ${describeBudget(contact)}`;

  const decision: Decision = {
    id: decisionId(),
    contactId: contact.id,
    at: now,
    moveId: best.move.id,
    score: Number(best.score.toFixed(3)),
    deltaReadiness: Number((best.delta * 100).toFixed(2)),
    readinessBefore: Number(before.toFixed(3)),
    readinessAfter: Number(best.after.toFixed(3)),
    binding: binding.dimension,
    bindingDeficit: binding.deficit,
    system: best.move.system,
    whyNow,
    alternatives,
    roleId: role.id,
    channel: best.channel,
    pressure: best.move.pressure,
  };

  return {
    decision,
    move: best.move,
    role,
    channel: best.channel,
    message: best.message,
    verdict: best.verdict,
    field,
  };
}

function describeBudget(contact: Contact): string {
  const remaining = contact.pressureBudget - contact.pressureSpent;
  return `${remaining.toFixed(2)} of ${contact.pressureBudget.toFixed(2)} pressure budget remains.`;
}

function attachClaims(move: Move, contact: Contact, claims: Claim[], now: string): Claim | null {
  if (!move.requires?.claim) return null;
  const valid = claims
    .filter(
      (c) =>
        Date.parse(c.expiresAt) > Date.parse(now) &&
        (!c.segment || c.segment === "*" || c.segment === contact.trade),
    )
    .sort((a, b) => Number(b.segment === contact.trade) - Number(a.segment === contact.trade));
  return valid[0] ?? null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
