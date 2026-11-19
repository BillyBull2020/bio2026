import test from "node:test";
import assert from "node:assert/strict";
import {
  applySignal,
  bindingConstraint,
  decayField,
  priorField,
  projectField,
  readiness,
} from "../src/neuro/field.ts";
import { MOVES } from "../src/neuro/moves.ts";
import { SIGNALS } from "../src/neuro/signals.ts";
import { field, NOW } from "./helpers.ts";

test("readiness rises monotonically with every resource", () => {
  const base = field();
  const low = readiness({ ...base, trust: 0.1 });
  const mid = readiness({ ...base, trust: 0.5 });
  const high = readiness({ ...base, trust: 0.9 });
  assert.ok(low < mid && mid < high);
});

test("binding constraint prefers the largest weighted deficit", () => {
  const f = field({ trust: 0.15, clarity: 0.8, anticipation: 0.8, safety: 0.8, agency: 0.8, commitment: 0.8 });
  const binding = bindingConstraint(f);
  assert.equal(binding.dimension, "trust");
});

test("commitment is gated when trust is collapsed", () => {
  const f = field({ trust: 0.12, clarity: 0.9, safety: 0.9, commitment: 0.05 });
  const binding = bindingConstraint(f);
  assert.notEqual(binding.dimension, "commitment");
});

test("signals have diminishing returns", () => {
  let f = field({ trust: 0.2 });
  const first = applySignal(f, SIGNALS.reply_positive, NOW).trust - f.trust;
  f = applySignal(f, SIGNALS.reply_positive, NOW);
  const second = applySignal(f, SIGNALS.reply_positive, NOW).trust - f.trust;
  assert.ok(first > 0);
  assert.ok(second < first);
});

test("decay pulls a resource back toward its prior", () => {
  const f = field({ trust: 0.95, updatedAt: "2026-10-01T00:00:00.000Z" });
  const decayed = decayField(f, NOW);
  assert.ok(decayed.trust < f.trust);
  assert.ok(decayed.trust > 0.34);
});

test("projected field matches the move's declared direction", () => {
  const f = field({ trust: 0.3 });
  const projected = projectField(f, MOVES.local_proof, NOW);
  assert.ok(projected.trust > f.trust);
});

test("priors are bounded and self-consistent", () => {
  const p = priorField(NOW);
  for (const key of ["safety", "trust", "anticipation", "clarity", "agency", "commitment"] as const) {
    assert.ok(p[key] >= 0 && p[key] <= 1);
  }
  assert.ok(readiness(p) > 0 && readiness(p) < 1);
});
