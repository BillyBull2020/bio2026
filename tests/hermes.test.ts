import test from "node:test";
import assert from "node:assert/strict";
import { askHermes, buildOpsPrompt, cleanHermesOutput, hermesStatus } from "../src/tools/hermes.ts";

const snapshot = {
  tenant: "Summit Ridge Roofing",
  revenueRecovered: 14_500,
  jobsBooked: 1,
  pipelineValue: 33_241,
  missedCalls: 85,
  actionsToday: 8,
  openReviews: 1,
  top: [
    { name: "Tom Becker", situation: "trust", move: "Confirm and reassure", value: 14_500, readiness: 0.56, blocked: false },
  ],
};

test("the Hermes prompt carries the boundary and the snapshot", () => {
  const prompt = buildOpsPrompt(snapshot, "What should I focus on today?");
  assert.match(prompt, /read-only/i);
  assert.match(prompt, /cannot send messages/i);
  assert.match(prompt, /Summit Ridge Roofing/);
  assert.match(prompt, /Tom Becker/);
  assert.match(prompt, /What should I focus on today\?/);
});

test("Hermes output is cleaned of ANSI and box drawing", () => {
  const raw = "\u001b[31m│ banner │\u001b[0m\nActual answer\n";
  assert.equal(cleanHermesOutput(raw), "Actual answer");
});

test("a missing Hermes binary fails closed", async () => {
  const result = await askHermes(snapshot, "hello", { bin: "C:\\does-not-exist\\hermes.exe", timeoutMs: 1000 });
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /not installed/i);
});

test("status reports the configured provider and model", () => {
  const status = hermesStatus();
  assert.equal(typeof status.available, "boolean");
  assert.ok(status.provider.length > 0);
  assert.ok(status.model.length > 0);
});
