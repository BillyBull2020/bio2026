import type {
  Channel,
  Claim,
  Contact,
  DecisionField,
  KernelSettings,
  Move,
  SignalType,
  SimulationConfig,
  SimulationMetrics,
  SimulationResult,
} from "../neuro/types.ts";
import { approach, bindingConstraint, clamp01, priorField, projectField, readiness } from "../neuro/field.ts";
import { MOVES } from "../neuro/moves.ts";
import { ROLES } from "../roles/registry.ts";
import { DEFAULT_SETTINGS } from "../kernel/policy.ts";
import { SEED_CLAIMS } from "../kernel/claims.ts";
import type { Tenant } from "../kernel/store.ts";

/**
 * A discrete-event simulation, not a field experiment.
 *
 * It exists to answer one question honestly: if the scheduler's assumptions are
 * roughly right, does constraint-directed sequencing beat persona blasting on
 * bookings *without* raising opt-outs? The assumptions are printed with every
 * result and they are deliberately conservative about the OS.
 */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

interface SimContact {
  id: string;
  field: DecisionField;
  intent: number;
  trustPrior: number;
  load: number;
  pressureSensitivity: number;
  preference: Channel;
  ticket: number;
  sends: number;
  pressure: number;
  optedOut: boolean;
  booked: boolean;
  complaints: number;
  channel: Channel;
}

const TENANT: Tenant = {
  name: "Simulated Roofing Co.",
  trade: "roofing",
  city: "Denver",
  state: "CO",
  avgTicket: 14_500,
  ownerName: "Sam Owner",
  ownerPhone: "+1 303-555-0100",
  proof: { name: "Peer Co.", city: "Lakewood", result: "booked more jobs", action: "a profile check" },
  reviewLink: "https://example.com/review",
};

function makePopulation(config: SimulationConfig, seed: number): SimContact[] {
  const rng = mulberry32(seed * 7919 + 13);
  const out: SimContact[] = [];
  for (let i = 0; i < config.contacts; i++) {
    const intent = 0.15 + 0.7 * rng() ** 1.4;
    const trustPrior = 0.25 + 0.45 * rng();
    const load = rng();
    const pressureSensitivity = 0.3 + 0.7 * rng();
    const preference: Channel = rng() < 0.62 ? "sms" : "email";
    const field = priorField("2026-01-01T00:00:00.000Z");
    field.safety = clamp01(0.62 + 0.06 * (1 - pressureSensitivity));
    field.trust = clamp01(0.2 + 0.5 * trustPrior + 0.1 * intent);
    field.anticipation = clamp01(0.24 + 0.36 * intent + 0.08 * rng());
    field.clarity = clamp01(0.68 - 0.3 * load);
    field.agency = clamp01(0.48 + 0.18 * (1 - pressureSensitivity));
    field.commitment = clamp01(0.04 + 0.16 * intent);
    field.confidence = 0.4;
    out.push({
      id: `sim_${i}`,
      field,
      intent,
      trustPrior,
      load,
      pressureSensitivity,
      preference,
      ticket: config.avgTicket * (0.65 + 0.8 * rng()),
      sends: 0,
      pressure: 0,
      optedOut: false,
      booked: false,
      complaints: 0,
      channel: preference,
    });
  }
  return out;
}

function matchScore(move: Move, field: DecisionField): number {
  let weighted = 0;
  let total = 0;
  for (const [dim, gain] of Object.entries(move.gains) as Array<[keyof DecisionField, number]>) {
    if (dim === "confidence" || dim === "updatedAt" || dim === "evidence") continue;
    weighted += gain * (1 - (field[dim] as number)) ** 2.2;
    total += gain;
  }
  return total === 0 ? 0.2 : clamp01(weighted / total);
}

function replyProbability(contact: SimContact, move: Move, channel: Channel): number {
  const match = matchScore(move, contact.field);
  const channelFit = channel === contact.preference ? 1 : 0.82;
  const fatigue = Math.min(0.5, contact.sends * 0.07);
  const p =
    0.045 *
    (0.2 + 1.8 * match) *
    (0.5 + 1.05 * contact.intent) *
    channelFit *
    (1 - fatigue) *
    (1 - 0.28 * move.pressure);
  return clamp01(p);
}

function bookingProbability(contact: SimContact, move: Move): number {
  const f = contact.field;
  const z =
    -4.9 +
    2.8 * f.trust +
    2.2 * f.clarity +
    1.5 * f.anticipation +
    1.2 * f.agency +
    0.8 * f.safety -
    1.6 * contact.pressure;
  return sigmoid(z);
}

function optOutProbability(contact: SimContact, move: Move): number {
  const match = matchScore(move, contact.field);
  return clamp01(
    0.0012 +
      0.035 * contact.pressure ** 2 +
      0.012 * (1 - match) +
      0.008 * (1 - contact.intent) +
      0.01 * contact.pressureSensitivity * move.pressure,
  );
}

interface ArmMetrics {
  sends: number;
  replies: number;
  bookings: number;
  optOuts: number;
  complaints: number;
  revenue: number;
}

function emptyMetrics(): ArmMetrics {
  return { sends: 0, replies: 0, bookings: 0, optOuts: 0, complaints: 0, revenue: 0 };
}

function applyMove(contact: SimContact, move: Move, rng: () => number): void {
  const projected = projectField(contact.field, move, "2026-01-01T00:00:00.000Z");
  const effect = 0.55 + 0.45 * rng();
  for (const dim of ["safety", "trust", "anticipation", "clarity", "agency", "commitment"] as const) {
    contact.field[dim] = approach(contact.field[dim], (projected[dim] - contact.field[dim]) * effect);
  }
  contact.sends += 1;
  contact.pressure += move.pressure;
}

function resolve(contact: SimContact, move: Move, channel: Channel, rng: () => number, arm: ArmMetrics): void {
  arm.sends += 1;
  const pReply = replyProbability(contact, move, channel);
  applyMove(contact, move, rng);

  if (rng() < pReply) {
    arm.replies += 1;
    const pBook = bookingProbability(contact, move);
    if (rng() < pBook) {
      arm.bookings += 1;
      arm.revenue += contact.ticket * 0.65;
      contact.booked = true;
      return;
    }
    contact.field = {
      ...contact.field,
      trust: approach(contact.field.trust, 0.06),
      commitment: approach(contact.field.commitment, 0.04),
      clarity: approach(contact.field.clarity, 0.03),
    };
  }

  if (rng() < optOutProbability(contact, move)) {
    arm.optOuts += 1;
    contact.optedOut = true;
  }

  if (rng() < 0.0008 + 0.012 * contact.pressure ** 2) {
    arm.complaints += 1;
  }
}

function legalMovesForOS(contact: SimContact): Move[] {
  const role = ROLES.reviver;
  return role.moves
    .map((id) => MOVES[id])
    .filter((m) => m && m.id !== "wait" && m.minStage.includes("open"));
}

function chooseOSMove(contact: SimContact): Move | null {
  const moves = legalMovesForOS(contact);
  if (moves.length === 0) return null;
  const binding = bindingConstraint(contact.field);
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const after = readiness(projectField(contact.field, move, "2026-01-01T00:00:00.000Z"));
    const delta = after - readiness(contact.field);
    const alignment = move.gains[binding.dimension] ?? 0;
    const score = delta * 80 + alignment * 15 - move.pressure * (0.35 + contact.pressure * 0.18);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  if (!best || bestScore < 1.4) return null;
  if (contact.pressure + best.pressure > 3) return null;
  return best;
}

function runArm(config: SimulationConfig, seed: number, armName: "baseline" | "choiceos"): { metrics: ArmMetrics; blocks: number } {
  const rng = mulberry32(seed * 104729 + (armName === "baseline" ? 7 : 31));
  const population = makePopulation(config, seed);
  const metrics = emptyMetrics();
  let blocks = 0;
  const pitch: Move[] = [MOVES.warm_open, MOVES.name_real_loss, MOVES.future_pace, MOVES.local_proof];

  for (const contact of population) {
    if (contact.optedOut) continue;
    if (armName === "baseline") {
      for (let day = 0; day < Math.min(config.days, 9); day += 3) {
        if (contact.optedOut || contact.booked) break;
        if (contact.sends >= config.baselineTouches) break;
        const move = pitch[Math.floor(rng() * pitch.length)];
        resolve(contact, move, contact.preference, rng, metrics);
      }
    } else {
      for (let day = 0; day < config.days; day += 2) {
        if (contact.optedOut || contact.booked) break;
        if (contact.sends >= 2) break;
        const move = chooseOSMove(contact);
        if (!move) continue;
        if (contact.sends > 0 && rng() < 0.12) continue; // the OS is allowed to wait
        resolve(contact, move, contact.preference, rng, metrics);
      }
    }
  }
  return { metrics, blocks };
}

function toPublic(config: SimulationConfig, arm: ArmMetrics): SimulationMetrics {
  const contacts = config.contacts;
  return {
    contacts,
    sends: arm.sends,
    replies: arm.replies,
    bookings: arm.bookings,
    optOuts: arm.optOuts,
    complaints: arm.complaints,
    revenue: Math.round(arm.revenue),
    replyRate: Number((arm.replies / contacts).toFixed(4)),
    bookingRate: Number((arm.bookings / contacts).toFixed(4)),
    optOutRate: Number((arm.optOuts / contacts).toFixed(4)),
    revenuePer1k: Math.round((arm.revenue / contacts) * 1000),
    sendsPerContact: Number((arm.sends / contacts).toFixed(2)),
    policyBlocks: 0,
  };
}

export function runSimulation(partial: Partial<SimulationConfig> = {}): SimulationResult {
  const config: SimulationConfig = {
    contacts: partial.contacts ?? 800,
    days: partial.days ?? 21,
    seeds: partial.seeds ?? 6,
    avgTicket: partial.avgTicket ?? 14_500,
    baselineTouches: partial.baselineTouches ?? 3,
  };

  const perSeed: SimulationResult["perSeed"] = [];
  for (let seed = 1; seed <= config.seeds; seed++) {
    const base = runArm(config, seed, "baseline");
    const os = runArm(config, seed, "choiceos");
    perSeed.push({
      seed,
      baseline: toPublic(config, base.metrics),
      choiceos: toPublic(config, os.metrics),
    });
  }

  const avg = (pick: (m: SimulationMetrics) => number, arm: "baseline" | "choiceos") =>
    perSeed.reduce((sum, s) => sum + pick(s[arm]), 0) / perSeed.length;

  const baseAgg: SimulationMetrics = {
    contacts: config.contacts,
    sends: Math.round(avg((m) => m.sends, "baseline")),
    replies: Math.round(avg((m) => m.replies, "baseline")),
    bookings: Math.round(avg((m) => m.bookings, "baseline")),
    optOuts: Math.round(avg((m) => m.optOuts, "baseline")),
    complaints: Math.round(avg((m) => m.complaints, "baseline")),
    revenue: Math.round(avg((m) => m.revenue, "baseline")),
    replyRate: avg((m) => m.replyRate, "baseline"),
    bookingRate: avg((m) => m.bookingRate, "baseline"),
    optOutRate: avg((m) => m.optOutRate, "baseline"),
    revenuePer1k: Math.round(avg((m) => m.revenuePer1k, "baseline")),
    sendsPerContact: avg((m) => m.sendsPerContact, "baseline"),
    policyBlocks: 0,
  };

  const osAgg: SimulationMetrics = {
    contacts: config.contacts,
    sends: Math.round(avg((m) => m.sends, "choiceos")),
    replies: Math.round(avg((m) => m.replies, "choiceos")),
    bookings: Math.round(avg((m) => m.bookings, "choiceos")),
    optOuts: Math.round(avg((m) => m.optOuts, "choiceos")),
    complaints: Math.round(avg((m) => m.complaints, "choiceos")),
    revenue: Math.round(avg((m) => m.revenue, "choiceos")),
    replyRate: avg((m) => m.replyRate, "choiceos"),
    bookingRate: avg((m) => m.bookingRate, "choiceos"),
    optOutRate: avg((m) => m.optOutRate, "choiceos"),
    revenuePer1k: Math.round(avg((m) => m.revenuePer1k, "choiceos")),
    sendsPerContact: avg((m) => m.sendsPerContact, "choiceos"),
    policyBlocks: 0,
  };

  const pct = (a: number, b: number) => (b === 0 ? 0 : Number((((a - b) / b) * 100).toFixed(1)));
  return {
    config,
    baseline: baseAgg,
    choiceos: osAgg,
    delta: {
      replyRatePct: pct(osAgg.replyRate, baseAgg.replyRate),
      bookingRatePct: pct(osAgg.bookingRate, baseAgg.bookingRate),
      optOutRatePct: pct(osAgg.optOutRate, baseAgg.optOutRate),
      revenuePct: pct(osAgg.revenue, baseAgg.revenue),
      sendsPct: pct(osAgg.sendsPerContact, baseAgg.sendsPerContact),
    },
    perSeed,
    assumptions: [
      "Synthetic population; not field data. Latent intent, trust prior and cognitive load are drawn from fixed distributions.",
      "Baseline models three generic persona touches over nine days with no state targeting and no constraint sequencing.",
      "ChoiceOS uses the same move catalogue and the same field model, plans every two days, and is allowed to do nothing.",
      "Reply and booking probabilities are monotone in the six resources and decreasing in accumulated pressure; the coefficients are informed assumptions, not measured effects.",
      "Every arm respects consent. Opt-out and complaint probabilities rise with pressure and irrelevance, so the OS cannot win by pushing harder.",
      "Revenue assumes a 65% close rate on booked jobs at the segment's average ticket.",
    ],
  };
}
