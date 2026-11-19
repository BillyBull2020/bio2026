import type { MoveId, RoleDefinition, VoiceSkin, VoiceSkinId } from "../neuro/types.ts";

/**
 * Four roles. Not fourteen.
 *
 * A role is a bundle of permissions, channels, moves and a voice. The work
 * itself lives in the kernel. This is why adding a "new agent" is now a config
 * change rather than a new orchestration layer.
 */
export const ROLES: Record<string, RoleDefinition> = {
  concierge: {
    id: "concierge",
    name: "Concierge",
    purpose: ["support", "transactional", "marketing"],
    channels: ["voice", "sms", "web", "email"],
    moves: [
      "warm_open",
      "objection_answer",
      "plain_next_step",
      "calendar_hold",
      "confirm",
      "human_bridge",
      "give_control",
      "escalate_human",
    ],
    voiceSkin: "warm",
    kpi: "First response under 60 seconds; booked or cleanly handed off.",
    autonomy: "full",
  },
  reviver: {
    id: "reviver",
    name: "Reviver",
    purpose: ["marketing"],
    channels: ["sms", "email", "voice"],
    moves: [
      "warm_open",
      "name_real_loss",
      "future_pace",
      "local_proof",
      "objection_answer",
      "reduce_choices",
      "plain_next_step",
      "micro_commit",
      "calendar_hold",
      "give_control",
      "close_loop",
      "human_bridge",
    ],
    voiceSkin: "direct",
    kpi: "Booked jobs from the existing customer base; opt-out below 1%.",
    autonomy: "full",
  },
  advocate: {
    id: "advocate",
    name: "Advocate",
    purpose: ["review", "support"],
    channels: ["sms", "email"],
    moves: ["confirm", "review_request", "close_loop", "escalate_human"],
    voiceSkin: "premium",
    kpi: "Review rate on completed jobs; no gating, no review removal.",
    autonomy: "draft_only",
  },
  analyst: {
    id: "analyst",
    name: "Analyst",
    purpose: ["support"],
    channels: ["web"],
    moves: [],
    voiceSkin: "clinical",
    kpi: "Every claim traceable; every audit reproducible.",
    autonomy: "human_required",
  },
};

export const ROLE_LIST: RoleDefinition[] = Object.values(ROLES);

export const VOICE_SKINS: Record<VoiceSkinId, VoiceSkin> = {
  warm: {
    id: "warm",
    label: "Warm",
    warmth: 0.82,
    brevity: 0.55,
    formality: 0.35,
    personas: ["Bella", "Aria", "Sarah", "Meghan", "Iris"],
    sample: "I've got you. Let's make this the last time you have to chase this.",
  },
  direct: {
    id: "direct",
    label: "Direct",
    warmth: 0.45,
    brevity: 0.85,
    formality: 0.45,
    personas: ["Chase", "Jenny", "Mark", "Vicki", "Nova"],
    sample: "Two numbers. One decision. Here's the math.",
  },
  premium: {
    id: "premium",
    label: "Premium",
    warmth: 0.6,
    brevity: 0.7,
    formality: 0.75,
    personas: ["Titan", "Jules", "Ben", "Zara"],
    sample: "Consider it handled. You'll have the full brief before we speak.",
  },
  clinical: {
    id: "clinical",
    label: "Clinical",
    warmth: 0.25,
    brevity: 0.9,
    formality: 0.8,
    personas: ["Atlas", "Rex", "Comment Scout", "Cortex"],
    sample: "Four findings. Two are material. Sources attached.",
  },
};

export function roleForPurpose(purpose: string): RoleDefinition {
  if (purpose === "review") return ROLES.advocate;
  if (purpose === "transactional") return ROLES.concierge;
  return ROLES.reviver;
}

export function roleCanMove(roleId: string, moveId: MoveId): boolean {
  const role = ROLES[roleId];
  return Boolean(role && role.moves.includes(moveId));
}

export function toneFor(role: RoleDefinition): VoiceSkin {
  return VOICE_SKINS[role.voiceSkin];
}
