import test from "node:test";
import assert from "node:assert/strict";
import { runSimulation } from "../src/sim/engine.ts";

test("simulation is deterministic for a fixed seed count", () => {
  const a = runSimulation({ contacts: 300, days: 14, seeds: 3 });
  const b = runSimulation({ contacts: 300, days: 14, seeds: 3 });
  assert.deepEqual(a.baseline, b.baseline);
  assert.deepEqual(a.choiceos, b.choiceos);
});

test("constraint sequencing sends fewer messages and produces fewer opt-outs", () => {
  const result = runSimulation({ contacts: 600, days: 21, seeds: 5 });
  assert.ok(result.choiceos.sendsPerContact < result.baseline.sendsPerContact, "expected fewer sends");
  assert.ok(result.choiceos.optOutRate < result.baseline.optOutRate, "expected fewer opt-outs");
});

test("the OS does not lose meaningful bookings while sending less", () => {
  const result = runSimulation({ contacts: 800, days: 21, seeds: 6 });
  assert.ok(
    result.choiceos.bookingRate >= result.baseline.bookingRate * 0.95,
    `bookings fell too far: ${result.choiceos.bookingRate} vs ${result.baseline.bookingRate}`,
  );
});

test("results carry the assumptions and per-seed detail", () => {
  const result = runSimulation({ contacts: 200, days: 10, seeds: 2 });
  assert.equal(result.perSeed.length, 2);
  assert.ok(result.assumptions.length >= 5);
  assert.ok(result.assumptions.some((a) => a.toLowerCase().includes("not field data")));
});
