import type {
  Channel,
  Claim,
  Contact,
  DecisionField,
  KernelSettings,
  Move,
  Purpose,
} from "../src/neuro/types.ts";
import { DEFAULT_SETTINGS, type ActionInput, type PolicyContext } from "../src/kernel/policy.ts";
import { DEFAULT_TENANT, newContact, type Tenant } from "../src/kernel/store.ts";
import { SEED_CLAIMS } from "../src/kernel/claims.ts";

export const NOW = "2026-11-19T18:00:00.000Z";
export const LATER = "2026-11-19T19:00:00.000Z";

export const TENANT: Tenant = DEFAULT_TENANT;
export const CLAIMS: Claim[] = SEED_CLAIMS;
export const SETTINGS: KernelSettings = DEFAULT_SETTINGS;

export function makeContact(overrides: Partial<Contact> = {}): Contact {
  const contact = newContact(
    {
      firstName: "Test",
      lastName: "Contact",
      company: "Test Residence",
      city: "Denver",
      phone: "+1 303-555-0199",
      email: "test@example.com",
      tags: [],
    },
    TENANT,
    NOW,
  );
  contact.consent = [
    { purpose: "marketing", channel: "sms", granted: true, at: NOW, source: "test" },
    { purpose: "marketing", channel: "email", granted: true, at: NOW, source: "test" },
    { purpose: "marketing", channel: "voice", granted: true, at: NOW, source: "test" },
    { purpose: "review", channel: "sms", granted: true, at: NOW, source: "test" },
  ];
  return Object.assign(contact, overrides);
}

export function field(overrides: Partial<DecisionField> = {}): DecisionField {
  return {
    safety: 0.62,
    trust: 0.34,
    anticipation: 0.42,
    clarity: 0.5,
    agency: 0.55,
    commitment: 0.12,
    confidence: 0.5,
    updatedAt: NOW,
    evidence: [],
    ...overrides,
  };
}

export function action(
  move: Move,
  overrides: Partial<ActionInput> = {},
): ActionInput {
  return {
    move,
    channel: move.channels.includes("sms") ? "sms" : (move.channels[0] as Channel),
    purpose: move.purpose as Purpose,
    body: "Hello — this is a plain, specific message with one next step.",
    claimIds: [],
    initiatedBy: "system",
    isFirstContact: false,
    proofSegment: "roofing",
    reviewAudience: "all_completed",
    allowedNumbers: [],
    roleAutonomy: "full",
    ...overrides,
  };
}

export function policyContext(
  contact: Contact,
  input: ActionInput,
  overrides: Partial<PolicyContext> = {},
): PolicyContext {
  return {
    contact,
    now: NOW,
    localHour: 11,
    claims: CLAIMS,
    settings: SETTINGS,
    action: input,
    outbound: { h24: 0, d7: 0, d30: 0 },
    ...overrides,
  };
}
