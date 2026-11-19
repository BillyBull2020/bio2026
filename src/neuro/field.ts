/**
 * The decision field.
 *
 * Six resources, each 0..1. The field is a *model*, not a measurement:
 * it is the kernel's best estimate of what a person needs in order to move.
 * Every update is attributable to an event, and every event is in the log.
 */

import type {
  Contact,
  DecisionField,
  Dimension,
  EvidenceRef,
  Move,
  SignalDefinition,
  Stage,
} from "./types.ts";
import { DIMENSIONS, DIMENSION_META } from "./types.ts";

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function round(n: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export const LEVERAGE: Record<Dimension, number> = {
  safety: 0.65,
  trust: 1.0,
  anticipation: 0.85,
  clarity: 0.9,
  agency: 0.6,
  commitment: 1.15,
};

export const READINESS_WEIGHTS: Record<Dimension, number> = {
  safety: 0.14,
  trust: 0.22,
  anticipation: 0.18,
  clarity: 0.18,
  agency: 0.12,
  commitment: 0.16,
};

export function priorField(at: string): DecisionField {
  return {
    safety: DIMENSION_META.safety.prior,
    trust: DIMENSION_META.trust.prior,
    anticipation: DIMENSION_META.anticipation.prior,
    clarity: DIMENSION_META.clarity.prior,
    agency: DIMENSION_META.agency.prior,
    commitment: DIMENSION_META.commitment.prior,
    confidence: 0.35,
    updatedAt: at,
    evidence: [],
  };
}

/**
 * Move a resource toward a target with diminishing returns, so repeated
 * messages cannot pump a dimension to 1.0. The 0.35 ceiling on gain means
 * even a perfect intervention leaves room for the person.
 */
export function approach(current: number, gain: number): number {
  if (gain >= 0) return clamp01(current + gain * (1 - current) * 0.85);
  return clamp01(current + gain * current * 0.85);
}

export function applySignal(
  field: DecisionField,
  def: SignalDefinition,
  at: string,
  strength = 1,
): DecisionField {
  const next: DecisionField = { ...field, evidence: [...field.evidence] };
  for (const dim of DIMENSIONS) {
    const delta = def.deltas[dim];
    if (delta === undefined) continue;
    next[dim] = approach(next[dim], delta * strength * def.confidence);
  }
  next.confidence = clamp01(field.confidence + 0.08 * def.confidence);
  next.updatedAt = at;
  return next;
}

/** Exponential decay toward the prior. Prevents stale enthusiasm. */
export function decayField(field: DecisionField, now: string): DecisionField {
  const hours = Math.max(0, (Date.parse(now) - Date.parse(field.updatedAt)) / 3_600_000);
  if (hours < 1) return field;
  const next: DecisionField = { ...field, evidence: [...field.evidence] };
  for (const dim of DIMENSIONS) {
    const meta = DIMENSION_META[dim];
    const factor = 0.5 ** (hours / meta.halfLifeHours);
    next[dim] = clamp01(meta.prior + (field[dim] - meta.prior) * factor);
  }
  next.confidence = clamp01(0.25 + (field.confidence - 0.25) * 0.5 ** (hours / 336));
  next.updatedAt = now;
  return next;
}

/** Weighted readiness, squashed to a probability-like number. */
export function readiness(field: DecisionField): number {
  let weighted = 0;
  for (const dim of DIMENSIONS) weighted += READINESS_WEIGHTS[dim] * field[dim];
  const z = (weighted - 0.46) * 8;
  return 1 / (1 + Math.exp(-z));
}

export function weightedResources(field: DecisionField): number {
  let weighted = 0;
  for (const dim of DIMENSIONS) weighted += READINESS_WEIGHTS[dim] * field[dim];
  return weighted;
}

export interface BindingConstraint {
  dimension: Dimension;
  deficit: number;
  score: number;
  /** Second place, for the "why not that one" line. */
  runnerUp: Dimension;
}

/**
 * The constraint that is both most lacking and most worth fixing.
 * `mutability` is supplied by the scheduler from the moves that are legal now.
 */
export function bindingConstraint(
  field: DecisionField,
  mutability?: Partial<Record<Dimension, number>>,
  eligible?: Dimension[],
): BindingConstraint {
  const dims = eligible && eligible.length > 0 ? eligible : [...DIMENSIONS];
  let best: Dimension = dims[0];
  let bestScore = -Infinity;
  let second: Dimension = dims[1] ?? dims[0];
  let secondScore = -Infinity;
  for (const dim of dims) {
    const deficit = 1 - field[dim];
    const m = mutability?.[dim] ?? 1;
    let score = deficit * LEVERAGE[dim] * m;
    // Momentum only matters once the basics are in place. A frightened or
    // confused person is not "one micro-commitment away" from yes.
    if (dim === "commitment" && Math.min(field.trust, field.clarity, field.safety) < 0.45) score *= 0.3;
    if (dim === "anticipation" && field.trust < 0.3) score *= 0.5;
    if (dim === "agency" && field.safety < 0.3) score *= 0.5;
    if (score > bestScore) {
      second = best;
      secondScore = bestScore;
      best = dim;
      bestScore = score;
    } else if (score > secondScore) {
      second = dim;
      secondScore = score;
    }
  }
  return {
    dimension: best,
    deficit: round(1 - field[best], 4),
    score: round(bestScore, 4),
    runnerUp: second,
  };
}

/** What the field would look like if the move landed exactly as expected. */
export function projectField(field: DecisionField, move: Move, at: string): DecisionField {
  const next: DecisionField = { ...field, evidence: [...field.evidence] };
  for (const dim of DIMENSIONS) {
    const gain = move.gains[dim];
    if (gain === undefined) continue;
    next[dim] = approach(next[dim], gain);
  }
  next.updatedAt = at;
  next.confidence = clamp01(field.confidence + 0.03);
  return next;
}

export function deriveStage(contact: Contact, field: DecisionField, now: string): Stage {
  if (contact.optedOut) return "exited";
  if (contact.stage === "paused") return "paused";

  if (contact.lastSignal) {
    const days = (Date.parse(now) - Date.parse(contact.lastSignal.at)) / 86_400_000;
    const type = contact.lastSignal.type;
    if ((type === "booking" || type === "purchase") && days <= 45) return "committed";
    if (type === "job_completed" && days <= 60) return "sustained";
    if ((type === "complaint" || type === "human_handoff") && days <= 30) return "human";
  }

  if (contact.stage === "human") return "human";
  if (contact.stage === "sustained") return "sustained";
  if (contact.stage === "committed") return "committed";

  const lastTouch = contact.lastInboundAt ?? contact.lastOutboundAt;
  const daysQuiet = lastTouch ? (Date.parse(now) - Date.parse(lastTouch)) / 86_400_000 : Infinity;

  if (contact.lastSignal) {
    const days = (Date.parse(now) - Date.parse(contact.lastSignal.at)) / 86_400_000;
    if (days <= 30) return "open";
  }

  if (field.commitment >= 0.72) return "committed";
  if (field.commitment >= 0.42 && field.clarity >= 0.62) return "proven";
  if (field.anticipation >= 0.6 && field.trust >= 0.48) return "framed";
  if (field.trust >= 0.58) return "trusted";
  if (contact.lastInboundAt && daysQuiet <= 30) return "open";
  if (contact.lastOutboundAt) {
    const daysOut = (Date.parse(now) - Date.parse(contact.lastOutboundAt)) / 86_400_000;
    if (daysOut <= 45) return "open";
  }
  return "dormant";
}

export function stageLabel(stage: Stage): string {
  const labels: Record<Stage, string> = {
    dormant: "Dormant",
    signal: "Signal",
    open: "Open",
    trusted: "Trusted",
    framed: "Framed",
    proven: "Proven",
    committed: "Committed",
    sustained: "Sustained",
    paused: "Paused",
    human: "Human",
    exited: "Exited",
  };
  return labels[stage];
}

/** Convenience for the console: normalised deficits, biggest first. */
export function deficits(field: DecisionField): Array<{ dimension: Dimension; deficit: number }> {
  return DIMENSIONS.map((dimension) => ({
    dimension,
    deficit: round(1 - field[dimension], 3),
  })).sort((a, b) => b.deficit - a.deficit);
}

export function evidenceNote(kind: EvidenceRef["kind"], id: string, note?: string): EvidenceRef {
  return { kind, id, note };
}

export function fieldSummary(field: DecisionField): string {
  const top = deficits(field)[0];
  return `readiness ${(readiness(field) * 100).toFixed(0)}%, binding constraint ${DIMENSION_META[top.dimension].label.toLowerCase()} (${(top.deficit * 100).toFixed(0)}% gap)`;
}
