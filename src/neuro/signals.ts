import type { SignalDefinition, SignalType } from "./types.ts";

/**
 * Signal catalogue.
 *
 * Deltas are deliberately conservative and mostly small. A single event should
 * never flip a person from cold to committed; it should move the estimate a
 * little and raise confidence. The kernel is in the business of accumulating
 * evidence, not believing the last thing it saw.
 */
export const SIGNALS: Record<SignalType, SignalDefinition> = {
  inbound_call: {
    type: "inbound_call",
    label: "Inbound call",
    deltas: { trust: 0.05, clarity: 0.04, commitment: 0.07 },
    confidence: 0.9,
    value: 10,
    stageHint: "open",
  },
  missed_call: {
    type: "missed_call",
    label: "Missed call",
    deltas: { trust: -0.06, clarity: -0.02, anticipation: -0.02 },
    confidence: 0.9,
    value: 9,
    stageHint: "signal",
  },
  form_fill: {
    type: "form_fill",
    label: "Form fill",
    deltas: { anticipation: 0.06, commitment: 0.09, clarity: 0.03 },
    confidence: 0.85,
    value: 9,
    stageHint: "open",
  },
  email_open: {
    type: "email_open",
    label: "Email open",
    deltas: { trust: 0.01, anticipation: 0.01 },
    confidence: 0.35,
    value: 1,
  },
  link_click: {
    type: "link_click",
    label: "Link click",
    deltas: { anticipation: 0.07, clarity: 0.03, commitment: 0.03 },
    confidence: 0.7,
    value: 4,
  },
  reply_positive: {
    type: "reply_positive",
    label: "Positive reply",
    deltas: { trust: 0.08, anticipation: 0.07, commitment: 0.05 },
    confidence: 0.9,
    value: 8,
    stageHint: "open",
  },
  reply_question: {
    type: "reply_question",
    label: "Question",
    deltas: { clarity: -0.04, trust: 0.02, commitment: 0.02 },
    confidence: 0.8,
    value: 6,
    stageHint: "open",
  },
  reply_objection_price: {
    type: "reply_objection_price",
    label: "Price objection",
    deltas: { clarity: -0.05, anticipation: -0.03, trust: 0.01 },
    confidence: 0.85,
    value: 7,
    stageHint: "open",
  },
  reply_objection_time: {
    type: "reply_objection_time",
    label: "Timing objection",
    deltas: { clarity: -0.04, agency: -0.03 },
    confidence: 0.85,
    value: 6,
    stageHint: "open",
  },
  reply_objection_trust: {
    type: "reply_objection_trust",
    label: "Trust objection",
    deltas: { trust: -0.09, safety: -0.03 },
    confidence: 0.9,
    value: 7,
    stageHint: "open",
  },
  reply_not_now: {
    type: "reply_not_now",
    label: "Not now",
    deltas: { agency: 0.05, clarity: -0.02, commitment: -0.03, anticipation: -0.02 },
    confidence: 0.9,
    value: 3,
  },
  booking: {
    type: "booking",
    label: "Booking",
    deltas: { commitment: 0.38, clarity: 0.1, trust: 0.08, anticipation: 0.08 },
    confidence: 0.98,
    value: 20,
    stageHint: "committed",
  },
  job_completed: {
    type: "job_completed",
    label: "Job completed",
    deltas: { trust: 0.1, commitment: 0.12, safety: 0.04 },
    confidence: 0.95,
    value: 12,
    stageHint: "sustained",
  },
  review_left: {
    type: "review_left",
    label: "Review left",
    deltas: { trust: 0.1, commitment: 0.12 },
    confidence: 0.95,
    value: 8,
    stageHint: "sustained",
  },
  complaint: {
    type: "complaint",
    label: "Complaint",
    deltas: { trust: -0.2, safety: -0.16, anticipation: -0.06 },
    confidence: 0.95,
    value: 15,
  },
  no_response: {
    type: "no_response",
    label: "No response",
    deltas: { anticipation: -0.03, trust: -0.02 },
    confidence: 0.6,
    value: 0,
  },
  human_handoff: {
    type: "human_handoff",
    label: "Human handoff",
    deltas: { trust: 0.09, safety: 0.1 },
    confidence: 0.9,
    value: 10,
  },
  purchase: {
    type: "purchase",
    label: "Purchase",
    deltas: { commitment: 0.42, trust: 0.1, clarity: 0.08 },
    confidence: 0.99,
    value: 30,
    stageHint: "committed",
  },
  seasonal_event: {
    type: "seasonal_event",
    label: "Seasonal event",
    deltas: { anticipation: 0.05, safety: -0.01 },
    confidence: 0.6,
    value: 3,
  },
  competitor_move: {
    type: "competitor_move",
    label: "Competitor move",
    deltas: { anticipation: -0.04, safety: -0.03 },
    confidence: 0.55,
    value: 4,
  },
};

export function isSignalType(value: string): value is SignalType {
  return Object.hasOwn(SIGNALS, value);
}

export const SIGNAL_LIST: SignalDefinition[] = Object.values(SIGNALS);
