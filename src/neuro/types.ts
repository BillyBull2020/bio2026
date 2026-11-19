/**
 * Choice OS — core domain types.
 *
 * Design rule: the unit of work is a *decision*, not an agent.
 * Everything below is deliberately small and serialisable so the whole
 * state can be replayed from an append-only event log.
 */

export type Channel = "voice" | "sms" | "email" | "web" | "in_person";

export type Purpose = "marketing" | "transactional" | "support" | "review";

/** The three functional systems the OS reasons about. Not brain regions — control metaphors. */
export type System = "threat" | "social" | "deliberative";

/**
 * Six resources a person needs before they can say yes.
 * All are 0..1 and higher is better. They are estimates, not measurements.
 */
export const DIMENSIONS = [
  "safety",
  "trust",
  "anticipation",
  "clarity",
  "agency",
  "commitment",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_META: Record<
  Dimension,
  { label: string; system: System; blurb: string; prior: number; halfLifeHours: number }
> = {
  safety: {
    label: "Safety",
    system: "threat",
    blurb: "No pressure, no shame, an easy exit. The conversation is not a threat.",
    prior: 0.62,
    halfLifeHours: 720,
  },
  trust: {
    label: "Trust",
    system: "social",
    blurb: "Credible and on the customer's side. Proof beats promises.",
    prior: 0.34,
    halfLifeHours: 1440,
  },
  anticipation: {
    label: "Anticipation",
    system: "deliberative",
    blurb: "A specific, believable better future is visible from here.",
    prior: 0.42,
    halfLifeHours: 480,
  },
  clarity: {
    label: "Clarity",
    system: "deliberative",
    blurb: "Low cognitive load. One next step, no maze of options.",
    prior: 0.5,
    halfLifeHours: 720,
  },
  agency: {
    label: "Agency",
    system: "deliberative",
    blurb: "I am choosing this. It is not being done to me.",
    prior: 0.55,
    halfLifeHours: 1440,
  },
  commitment: {
    label: "Commitment",
    system: "deliberative",
    blurb: "A small action already taken. Momentum is real.",
    prior: 0.12,
    halfLifeHours: 2160,
  },
};

export type Stage =
  | "dormant"
  | "signal"
  | "open"
  | "trusted"
  | "framed"
  | "proven"
  | "committed"
  | "sustained"
  | "paused"
  | "human"
  | "exited";

export type MoveId =
  | "warm_open"
  | "name_real_loss"
  | "future_pace"
  | "local_proof"
  | "human_bridge"
  | "reduce_choices"
  | "plain_next_step"
  | "objection_answer"
  | "give_control"
  | "micro_commit"
  | "calendar_hold"
  | "confirm"
  | "review_request"
  | "close_loop"
  | "escalate_human"
  | "wait";

export interface Move {
  id: MoveId;
  label: string;
  system: System;
  purpose: Purpose;
  channels: Channel[];
  /** Expected resource gain at full effect. Applied with diminishing returns. */
  gains: Partial<Record<Dimension, number>>;
  /** 0..1. How much interpersonal pressure this move spends. */
  pressure: number;
  minStage: Stage[];
  /** Evidence the move may not run without. */
  requires?: {
    claim?: boolean;
    realDeadline?: boolean;
    sameSegmentProof?: boolean;
    consent?: Purpose;
  };
  guard: string;
  intent: string;
}

export interface EvidenceRef {
  kind: "event" | "claim" | "source" | "inference";
  id: string;
  note?: string;
}

export interface DecisionField {
  safety: number;
  trust: number;
  anticipation: number;
  clarity: number;
  agency: number;
  commitment: number;
  confidence: number;
  updatedAt: string;
  evidence: EvidenceRef[];
}

export type SignalType =
  | "inbound_call"
  | "missed_call"
  | "form_fill"
  | "email_open"
  | "link_click"
  | "reply_positive"
  | "reply_question"
  | "reply_objection_price"
  | "reply_objection_time"
  | "reply_objection_trust"
  | "reply_not_now"
  | "booking"
  | "job_completed"
  | "review_left"
  | "complaint"
  | "no_response"
  | "human_handoff"
  | "purchase"
  | "seasonal_event"
  | "competitor_move";

export interface SignalDefinition {
  type: SignalType;
  label: string;
  deltas: Partial<Record<Dimension, number>>;
  confidence: number;
  /** Value weight used by the portfolio scheduler. */
  value: number;
  stageHint?: Stage;
}

export interface SignalEvent {
  type: SignalType;
  at: string;
  source: string;
  detail?: string;
  value?: number;
}

export interface Consent {
  purpose: Purpose;
  channel: Channel;
  granted: boolean;
  at: string;
  source: string;
  expiresAt?: string;
}

export interface Claim {
  id: string;
  /** The exact sentence a message may use. */
  text: string;
  /** Numbers that are allowed to appear, with their source. */
  values: Record<string, number | string>;
  source: string;
  verifiedAt: string;
  expiresAt: string;
  segment?: string;
  /** Literal phrases this claim authorises through the content lint. */
  allowPhrases?: string[];
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  trade: string;
  city: string;
  state: string;
  timezone: string;
  phone: string;
  email: string;
  channelPreference: Channel;
  stage: Stage;
  field: DecisionField;
  consent: Consent[];
  optedOut: boolean;
  optedOutAt?: string;
  vulnerable: boolean;
  doNotAskReview: boolean;
  pressureSpent: number;
  pressureBudget: number;
  lastOutboundAt?: string;
  lastInboundAt?: string;
  outboundLog: string[];
  outboundCount24h: number;
  outboundCount7d: number;
  outboundCount30d: number;
  estimatedTicket: number;
  lostCallsPerMonth: number;
  missedRevenuePerMonth: number;
  createdAt: string;
  updatedAt: string;
  lastSignal?: { type: SignalType; at: string };
  tags: string[];
  notes?: string;
}

export interface ActionRecord {
  id: string;
  contactId: string;
  at: string;
  moveId: MoveId;
  roleId: string;
  channel: Channel;
  purpose: Purpose;
  body: string;
  subject?: string;
  claimIds: string[];
  pressure: number;
  policy: PolicyVerdict;
  decision: Decision;
}

export interface AlternateMove {
  moveId: MoveId;
  score: number;
  deltaReadiness: number;
  blocked?: string;
}

export interface Decision {
  id: string;
  contactId: string;
  at: string;
  moveId: MoveId;
  score: number;
  deltaReadiness: number;
  readinessBefore: number;
  readinessAfter: number;
  binding: Dimension;
  bindingDeficit: number;
  system: System;
  whyNow: string;
  alternatives: AlternateMove[];
  roleId: string;
  channel: Channel;
  /** Sum of expected pressure, used for the ethical budget. */
  pressure: number;
}

export type PolicySeverity = "block" | "warn";

export interface PolicyIssue {
  code: string;
  rule: string;
  severity: PolicySeverity;
  message: string;
  fix?: string;
}

export interface PolicyVerdict {
  allowed: boolean;
  issues: PolicyIssue[];
  checkedAt: string;
}

export interface KernelSettings {
  /** Local-time window in which outbound voice/SMS is permitted. */
  quietHours: { start: number; end: number; appliesTo: Channel[] };
  frequency: { per24h: number; per7d: number; per30d: number };
  pressureBudget: number;
  /** Require a verified claim for any numeric outcome statement. */
  requireClaimForNumbers: boolean;
  /** Disclose that the caller is an AI on the first voice turn. */
  requireAiDisclosure: boolean;
  /** Review requests go to every completed job, never only to promoters. */
  reviewAudience: "all_completed";
  /** Minimum readiness before an outbound marketing action is allowed. */
  minReadinessForOutbound: number;
  /** Moves at or above this pressure require a human in the loop. */
  humanApprovalAbovePressure: number;
}

export interface RoleDefinition {
  id: string;
  name: string;
  purpose: Purpose[];
  channels: Channel[];
  moves: MoveId[];
  voiceSkin: VoiceSkinId;
  kpi: string;
  /** What this role is allowed to decide without a human. */
  autonomy: "full" | "draft_only" | "human_required";
}

export type VoiceSkinId = "warm" | "direct" | "premium" | "clinical";

export interface VoiceSkin {
  id: VoiceSkinId;
  label: string;
  /** 0..1 */
  warmth: number;
  brevity: number;
  formality: number;
  /** Legacy persona names that map onto this skin. */
  personas: string[];
  sample: string;
}

export interface Tone {
  skin: VoiceSkin;
  sender: string;
  company: string;
}

export interface RenderFacts {
  firstName: string;
  company: string;
  trade: string;
  city: string;
  lostCalls: number;
  missedRevenue: number;
  ticket: number;
  claimText?: string;
  claimIds?: string[];
  proof?: { name: string; city: string; result: string; action: string };
  slotA?: string;
  slotB?: string;
  deadline?: string;
  humanName?: string;
  humanPhone?: string;
  reviewLink?: string;
  optOutLine: string;
  aiDisclosure: string;
  transcriptExcerpt?: string;
  topic?: string;
  objection?: "price" | "time" | "trust" | "generic";
  sender?: string;
  isFirstContact?: boolean;
}

export interface RenderedMessage {
  subject?: string;
  body: string;
  claimIds: string[];
}

export interface SimulationConfig {
  contacts: number;
  days: number;
  seeds: number;
  avgTicket: number;
  baselineTouches: number;
}

export interface SimulationMetrics {
  contacts: number;
  sends: number;
  replies: number;
  bookings: number;
  optOuts: number;
  complaints: number;
  revenue: number;
  replyRate: number;
  bookingRate: number;
  optOutRate: number;
  revenuePer1k: number;
  sendsPerContact: number;
  policyBlocks: number;
}

export interface SimulationResult {
  config: SimulationConfig;
  baseline: SimulationMetrics;
  choiceos: SimulationMetrics;
  delta: {
    replyRatePct: number;
    bookingRatePct: number;
    optOutRatePct: number;
    revenuePct: number;
    sendsPct: number;
  };
  perSeed: Array<{ seed: number; baseline: SimulationMetrics; choiceos: SimulationMetrics }>;
  assumptions: string[];
}
