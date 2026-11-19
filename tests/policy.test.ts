import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicy } from "../src/kernel/policy.ts";
import { MOVES } from "../src/neuro/moves.ts";
import { action, field, makeContact, policyContext } from "./helpers.ts";

function firstBlock(ctx: ReturnType<typeof policyContext>): string | undefined {
  return evaluatePolicy(ctx).issues.find((i) => i.severity === "block")?.code;
}

test("marketing without consent is blocked", () => {
  const contact = makeContact({ consent: [] });
  assert.equal(firstBlock(policyContext(contact, action(MOVES.warm_open))), "no_marketing_consent");
});

test("quiet hours block voice and SMS but not email", () => {
  const contact = makeContact();
  const sms = action(MOVES.warm_open, { channel: "sms" });
  const email = action(MOVES.warm_open, { channel: "email" });
  assert.equal(firstBlock(policyContext(contact, sms, { localHour: 22 })), "quiet_hours");
  assert.equal(firstBlock(policyContext(contact, email, { localHour: 22 })), undefined);
});

test("frequency caps block the second marketing touch in 24 hours", () => {
  const contact = makeContact();
  assert.equal(firstBlock(policyContext(contact, action(MOVES.warm_open), { outbound: { h24: 1, d7: 1, d30: 1 } })), "frequency_24h");
});

test("pressure budget is finite", () => {
  const contact = makeContact({ pressureSpent: 2.95 });
  const move = MOVES.calendar_hold;
  assert.equal(firstBlock(policyContext(contact, action(move, { realDeadline: "2026-11-21T16:00:00.000Z" }))), "pressure_budget");
});

test("a loss statement requires a verified claim", () => {
  const contact = makeContact();
  const move = MOVES.name_real_loss;
  const input = action(move, { body: "You are losing money every month. Reply and I'll show you the fix." });
  assert.equal(firstBlock(policyContext(contact, input)), "claim_required");
});

test("an untraceable number is blocked", () => {
  const contact = makeContact();
  const input = action(MOVES.warm_open, { body: "You are losing $31,900 this month. Want the fix?" });
  assert.equal(firstBlock(policyContext(contact, input)), "untraceable_number");
});

test("a traceable number passes when the claim is attached", () => {
  const contact = makeContact();
  const input = action(MOVES.warm_open, {
    body: "The term is 5x over 90 days. Want the details?",
    claimIds: ["claim_recovery_5x"],
  });
  assert.equal(firstBlock(policyContext(contact, input)), undefined);
});

test("manufactured urgency is blocked", () => {
  const contact = makeContact();
  const input = action(MOVES.warm_open, { body: "This offer expires today. Reply now." });
  assert.equal(firstBlock(policyContext(contact, input)), "manufactured_urgency");
});

test("review gating language is blocked", () => {
  const contact = makeContact();
  const input = action(MOVES.review_request, {
    channel: "sms",
    purpose: "review",
    body: "If you had a good experience, please leave us a 5-star review.",
  });
  assert.equal(firstBlock(policyContext(contact, input)), "review_gating_language");
});

test("review requests to only promoters are blocked", () => {
  const contact = makeContact();
  const input = action(MOVES.review_request, { channel: "sms", purpose: "review", reviewAudience: "promoters" });
  assert.equal(firstBlock(policyContext(contact, input)), "review_gating");
});

test("vulnerable contacts cannot receive automated pressure", () => {
  const contact = makeContact({ vulnerable: true });
  const input = action(MOVES.calendar_hold, { realDeadline: "2026-11-21T16:00:00.000Z" });
  assert.equal(firstBlock(policyContext(contact, input)), "vulnerable_contact");
});

test("opt-out blocks everything except a transactional confirmation", () => {
  const contact = makeContact({ optedOut: true });
  assert.equal(firstBlock(policyContext(contact, action(MOVES.warm_open))), "opt_out");
  const confirm = action(MOVES.confirm, { channel: "sms", purpose: "transactional", body: "You're set for Tuesday at 9:00." });
  assert.equal(firstBlock(policyContext(contact, confirm)), undefined);
});

test("first voice turn must disclose AI", () => {
  const contact = makeContact();
  const input = action(MOVES.warm_open, { channel: "voice", isFirstContact: true, body: "Hi, this is Ray. Is now a good time?" });
  assert.equal(firstBlock(policyContext(contact, input)), "ai_disclosure");
});

test("a loss message without a control step is blocked", () => {
  const contact = makeContact({ field: field({ safety: 0.8 }) });
  const input = action(MOVES.name_real_loss, {
    body: "You are losing 11 calls a month at $14,500 each. That is $31,900 gone.",
    claimIds: ["claim_missed_call_value"],
    allowedNumbers: [14500, 31900, 11],
  });
  assert.equal(firstBlock(policyContext(contact, input)), "loss_without_control");
});

test("a clean message passes every rail", () => {
  const contact = makeContact({ field: field({ trust: 0.45 }) });
  const input = action(MOVES.local_proof, {
    body: "Alvarez Roofing had the same problem. They booked 11 additional jobs. Want the one-page version? Reply STOP to opt out.",
    claimIds: ["claim_alvarez_case"],
    proofSegment: "roofing",
    allowedNumbers: [11],
  });
  const verdict = evaluatePolicy(policyContext(contact, input));
  assert.equal(verdict.allowed, true, JSON.stringify(verdict.issues));
});
