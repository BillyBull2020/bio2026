import test from "node:test";
import assert from "node:assert/strict";
import { auditText, calculateAudit } from "../src/audit/calculator.ts";

test("the audit math is explicit and conservative", () => {
  const result = calculateAudit({ trade: "roofing", missedCallsPerWeek: 20, averageTicket: 14_500, listSize: 500 });
  assert.equal(result.closeRate, 0.2);
  assert.equal(result.jobsAtStake, 208);
  assert.equal(result.annualAtStake, 3_016_000);
  assert.equal(result.monthlyAtStake, 251_333);
  assert.equal(result.assumptions.length, 3);
});

test("the audit never promises recovery", () => {
  const input = { trade: "hvac", missedCallsPerWeek: 10, averageTicket: 9_500, listSize: 200 };
  const text = auditText(input, calculateAudit(input));
  assert.match(text, /size of the leak, not a promise of recovery/i);
  assert.match(text, /three booked jobs or \$10,000/i);
  assert.doesNotMatch(text, /guaranteed/i);
});
