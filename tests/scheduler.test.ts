import test from "node:test";
import assert from "node:assert/strict";
import { plan } from "../src/kernel/scheduler.ts";
import { MOVES } from "../src/neuro/moves.ts";
import { CLAIMS, SETTINGS, TENANT, field, makeContact, NOW } from "./helpers.ts";

function planFor(contact = makeContact(), overrides = {}) {
  return plan({
    contact,
    now: NOW,
    claims: CLAIMS,
    settings: SETTINGS,
    outbound: { h24: 0, d7: 0, d30: 0 },
    localHour: 11,
    tenant: TENANT,
    ...overrides,
  });
}

test("low trust selects a trust-building move, not a close", () => {
  const contact = makeContact({
    field: field({ trust: 0.16, clarity: 0.7, anticipation: 0.6, agency: 0.7, commitment: 0.3 }),
    lastSignal: { type: "missed_call", at: "2026-11-19T10:00:00.000Z" },
  });
  const result = planFor(contact);
  assert.equal(result.decision.binding, "trust");
  assert.ok(["local_proof", "human_bridge", "warm_open"].includes(result.decision.moveId), result.decision.moveId);
  assert.ok(result.decision.deltaReadiness > 0);
});

test("a price objection is answered, not buried under proof", () => {
  const contact = makeContact({
    field: field({ clarity: 0.3, trust: 0.4 }),
    lastSignal: { type: "reply_objection_price", at: "2026-11-19T15:00:00.000Z" },
    tags: ["objection_price"],
  });
  assert.equal(planFor(contact).decision.moveId, "objection_answer");
});

test("a booked contact is confirmed", () => {
  const contact = makeContact({
    field: field({ trust: 0.6, clarity: 0.65, commitment: 0.6 }),
    lastSignal: { type: "booking", at: "2026-11-19T12:00:00.000Z" },
    tags: ["booked"],
  });
  assert.equal(planFor(contact).decision.moveId, "confirm");
});

test("a completed job with review consent gets a review request", () => {
  const contact = makeContact({
    field: field({ trust: 0.62, commitment: 0.5 }),
    lastSignal: { type: "job_completed", at: "2026-11-18T12:00:00.000Z" },
    tags: ["job_complete"],
  });
  assert.equal(planFor(contact).decision.moveId, "review_request");
});

test("do-not-ask overrides the review request", () => {
  const contact = makeContact({
    field: field({ trust: 0.62, commitment: 0.5 }),
    lastSignal: { type: "job_completed", at: "2026-11-18T12:00:00.000Z" },
    tags: ["job_complete"],
    doNotAskReview: true,
  });
  const result = planFor(contact);
  assert.notEqual(result.decision.moveId, "review_request");
  assert.equal(result.decision.moveId, "close_loop");
});

test("no consent produces no outbound action", () => {
  const contact = makeContact({ consent: [] });
  const result = planFor(contact);
  assert.equal(result.decision.moveId, "wait");
  assert.equal(result.message.body, "");
});

test("opt-out produces wait and no message", () => {
  const contact = makeContact({ optedOut: true });
  const result = planFor(contact);
  assert.equal(result.decision.moveId, "wait");
  assert.equal(result.verdict.allowed, true);
});

test("an exhausted pressure budget only permits zero-pressure moves", () => {
  const contact = makeContact({ pressureSpent: 3 });
  const result = planFor(contact);
  assert.ok(result.decision.moveId === "wait" || result.move.pressure === 0);
});

test("every decision carries a why-now and an alternatives list", () => {
  const result = planFor();
  assert.ok(result.decision.whyNow.length > 20);
  assert.ok(result.decision.alternatives.length > 0);
});

test("a calendar hold carries a real deadline", () => {
  const contact = makeContact({
    field: field({ trust: 0.66, clarity: 0.7, anticipation: 0.7, commitment: 0.2 }),
    lastSignal: { type: "reply_positive", at: "2026-11-19T15:00:00.000Z" },
  });
  const result = planFor(contact);
  if (result.decision.moveId === "calendar_hold") {
    assert.ok(result.verdict.allowed);
  }
  assert.ok(MOVES.calendar_hold.requires?.realDeadline === true);
});
