import type { Dimension, Move, MoveId, Stage } from "./types.ts";

const PRE_COMMIT: Stage[] = [
  "dormant",
  "signal",
  "open",
  "trusted",
  "framed",
  "proven",
];

const ALL: Stage[] = [...PRE_COMMIT, "committed", "sustained", "paused", "human"];

/**
 * The move catalogue. Every move is a small, auditable intervention aimed at
 * one binding constraint. There is no "pitch" move: pitching is a sequence of
 * moves, and the scheduler decides whether the sequence is warranted.
 */
export const MOVES: Record<MoveId, Move> = {
  warm_open: {
    id: "warm_open",
    label: "Warm open",
    system: "social",
    purpose: "marketing",
    channels: ["voice", "sms", "email", "web"],
    gains: { trust: 0.1, safety: 0.1, clarity: 0.04 },
    pressure: 0,
    minStage: PRE_COMMIT,
    guard: "Identify yourself, including that you are an AI, before asking for anything.",
    intent: "Lower the cost of the first second. Make it obvious who this is and why now.",
  },
  name_real_loss: {
    id: "name_real_loss",
    label: "Name a real loss",
    system: "threat",
    purpose: "marketing",
    channels: ["voice", "sms", "email"],
    gains: { anticipation: 0.16, clarity: 0.04 },
    pressure: 0.18,
    minStage: ["signal", "open", "trusted"],
    requires: { claim: true },
    guard:
      "Only a verified, customer-specific loss. Always pair with a control step in the same message. Never when safety < 0.35.",
    intent: "Make the status quo legible. Contrast is what turns a fact into a motive.",
  },
  future_pace: {
    id: "future_pace",
    label: "Future pace",
    system: "deliberative",
    purpose: "marketing",
    channels: ["voice", "sms", "email"],
    gains: { anticipation: 0.18, agency: 0.03 },
    pressure: 0.04,
    minStage: ["open", "trusted", "framed"],
    guard: "Describe a plausible ordinary Tuesday, not a fantasy. No outcome they cannot verify.",
    intent: "Give the brain something concrete to simulate. Anticipation is the reward.",
  },
  local_proof: {
    id: "local_proof",
    label: "Local proof",
    system: "social",
    purpose: "marketing",
    channels: ["voice", "sms", "email"],
    gains: { trust: 0.2, anticipation: 0.05, safety: 0.03 },
    pressure: 0.02,
    minStage: ["open", "trusted", "framed", "proven"],
    requires: { claim: true, sameSegmentProof: true },
    guard: "Same trade, same market, named with permission. The number comes from a signed case study, never from a template.",
    intent: "Borrow credibility from someone the customer can identify with.",
  },
  human_bridge: {
    id: "human_bridge",
    label: "Human bridge",
    system: "social",
    purpose: "support",
    channels: ["voice", "sms", "email"],
    gains: { trust: 0.16, safety: 0.12 },
    pressure: 0,
    minStage: ["open", "trusted", "framed", "proven"],
    guard: "A real person must actually be available. Never promise a callback you cannot staff.",
    intent: "Take the risk out of the next step by putting a human on it.",
  },
  reduce_choices: {
    id: "reduce_choices",
    label: "Reduce choices",
    system: "deliberative",
    purpose: "marketing",
    channels: ["voice", "sms", "email", "web"],
    gains: { clarity: 0.18, agency: 0.06 },
    pressure: 0,
    minStage: ["open", "trusted", "framed", "proven"],
    guard: "Two real options, not a false binary. Both must be genuinely acceptable.",
    intent: "Cut the option set until the next step is obvious.",
  },
  plain_next_step: {
    id: "plain_next_step",
    label: "Plain next step",
    system: "deliberative",
    purpose: "marketing",
    channels: ["voice", "sms", "email", "web"],
    gains: { clarity: 0.2, agency: 0.08, commitment: 0.04 },
    pressure: 0.02,
    minStage: ["open", "trusted", "framed", "proven"],
    guard: "One step, stated in plain language, with the time it takes.",
    intent: "Replace 'let me know' with a single, finite action.",
  },
  objection_answer: {
    id: "objection_answer",
    label: "Answer the objection",
    system: "deliberative",
    purpose: "marketing",
    channels: ["voice", "sms", "email"],
    gains: { clarity: 0.14, trust: 0.09, safety: 0.03 },
    pressure: 0,
    minStage: ["open", "trusted", "framed"],
    requires: { claim: true },
    guard: "Answer the objection that was actually raised, not the convenient one. Any outcome number needs a claim.",
    intent: "Convert a blocked decision into a solved problem.",
  },
  give_control: {
    id: "give_control",
    label: "Give control",
    system: "social",
    purpose: "marketing",
    channels: ["voice", "sms", "email", "web"],
    gains: { agency: 0.2, safety: 0.12 },
    pressure: 0,
    minStage: ALL,
    guard: "Include a real exit. 'No' must be as easy to send as 'yes'.",
    intent: "Remove the sense of being pushed. Autonomy is a nutrient, not a nice-to-have.",
  },
  micro_commit: {
    id: "micro_commit",
    label: "Micro-commitment",
    system: "deliberative",
    purpose: "marketing",
    channels: ["sms", "email", "web"],
    gains: { commitment: 0.22, agency: 0.06, clarity: 0.03 },
    pressure: 0.08,
    minStage: ["open", "trusted", "framed"],
    guard: "Under two minutes, and useful even if they never buy. No fake foot-in-the-door.",
    intent: "Create momentum with an action that pays for itself.",
  },
  calendar_hold: {
    id: "calendar_hold",
    label: "Hold two slots",
    system: "deliberative",
    purpose: "marketing",
    channels: ["voice", "sms", "email"],
    gains: { commitment: 0.3, clarity: 0.09 },
    pressure: 0.16,
    minStage: ["trusted", "framed", "proven"],
    requires: { realDeadline: true },
    guard: "The slots must exist. Never invent scarcity; a held slot is a promise.",
    intent: "Turn intention into a time and a place.",
  },
  confirm: {
    id: "confirm",
    label: "Confirm and reassure",
    system: "social",
    purpose: "transactional",
    channels: ["sms", "email", "voice"],
    gains: { safety: 0.16, trust: 0.09, clarity: 0.06 },
    pressure: 0,
    minStage: ["committed"],
    guard: "Only confirm what is actually booked. Include how to change it.",
    intent: "Kill the post-booking wobble before it becomes a no-show.",
  },
  review_request: {
    id: "review_request",
    label: "Ask for an honest review",
    system: "social",
    purpose: "review",
    channels: ["sms", "email"],
    gains: { commitment: 0.14, trust: 0.06 },
    pressure: 0.03,
    minStage: ["sustained"],
    requires: { consent: "review" },
    guard:
      "Sent to every completed job, never only to promoters. An unhappy customer gets a private fix, not a filter.",
    intent: "Close the loop and turn a delivered job into public proof.",
  },
  close_loop: {
    id: "close_loop",
    label: "Close the loop",
    system: "social",
    purpose: "marketing",
    channels: ["sms", "email"],
    gains: { trust: 0.1, safety: 0.1 },
    pressure: 0,
    minStage: ALL,
    guard: "No ask. This is how trust is kept after a no.",
    intent: "Leave the door open without leaning on it.",
  },
  escalate_human: {
    id: "escalate_human",
    label: "Escalate to a human",
    system: "social",
    purpose: "support",
    channels: ["voice", "sms", "email"],
    gains: { safety: 0.22, trust: 0.12 },
    pressure: 0,
    minStage: ALL,
    guard: "A named human must own it within the promised window.",
    intent: "Stop automating when automation would cost trust.",
  },
  wait: {
    id: "wait",
    label: "Wait",
    system: "deliberative",
    purpose: "marketing",
    channels: [],
    gains: {},
    pressure: 0,
    minStage: ALL,
    guard: "Doing nothing is a decision. It must be logged like any other.",
    intent: "Protect attention and pressure budget when no move clears the bar.",
  },
};

export const MOVE_LIST: Move[] = Object.values(MOVES);

export function isMoveId(value: string): value is MoveId {
  return Object.hasOwn(MOVES, value);
}

export function movesAtStage(stage: Stage): Move[] {
  return MOVE_LIST.filter((m) => m.id !== "wait" && m.minStage.includes(stage));
}

/** How much each dimension can be moved by a legal move right now. */
export function mutabilityFrom(moves: Move[]): Partial<Record<Dimension, number>> {
  const mutability: Partial<Record<Dimension, number>> = {};
  for (const move of moves) {
    for (const [dim, gain] of Object.entries(move.gains) as Array<[Dimension, number]>) {
      mutability[dim] = Math.max(mutability[dim] ?? 0, Math.min(1, gain * 3.2));
    }
  }
  return mutability;
}
