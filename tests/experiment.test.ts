import test from "node:test";
import assert from "node:assert/strict";
import { KernelStore, DEFAULT_TENANT } from "../src/kernel/store.ts";
import { seedDemo } from "../src/kernel/seed.ts";
import { DEFAULT_SETTINGS } from "../src/kernel/policy.ts";
import { SEED_CLAIMS } from "../src/kernel/claims.ts";
import { Conductor } from "../src/kernel/conductor.ts";
import { armFor, experimentReport } from "../src/kernel/experiment.ts";
import { NOW } from "./helpers.ts";

function seeded(): KernelStore {
  const store = new KernelStore({ tenant: DEFAULT_TENANT, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS, persist: false });
  seedDemo(store, NOW);
  return store;
}

test("holdout assignment is deterministic and covers both arms", () => {
  const ids = Array.from({ length: 200 }, (_, i) => `contact_${i}`);
  const first = ids.map((id) => armFor(id, 0.15, "pilot-test"));
  const second = ids.map((id) => armFor(id, 0.15, "pilot-test"));
  assert.deepEqual(first, second);
  assert.ok(first.includes("holdout"));
  assert.ok(first.includes("treatment"));
  assert.equal(armFor("x", 0), "treatment");
  assert.equal(armFor("x", 1), "holdout");
});

test("experiment report splits the eligible book without inventing outcomes", () => {
  const report = experimentReport(seeded(), { CHOICE_HOLDOUT_PCT: "0.5", CHOICE_EXPERIMENT_ID: "pilot-test" } as NodeJS.ProcessEnv);
  assert.equal(report.id, "pilot-test");
  assert.equal(report.treatment.contacts + report.holdout.contacts, 14);
  assert.equal(report.treatment.bookings + report.holdout.bookings, 1);
  assert.ok(report.absoluteBookingLift !== null);
});

test("holdout contacts are not outbound-planned, but inbound replies still work", () => {
  const previous = process.env.CHOICE_HOLDOUT_PCT;
  process.env.CHOICE_HOLDOUT_PCT = "1";
  try {
    const store = seeded();
    const conductor = new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS);
    const contact = store.contacts()[0]!;
    assert.equal(conductor.planFor(contact.id, NOW), null);
    const inbound = conductor.planFor(contact.id, NOW, { initiatedBy: "inbound" });
    assert.ok(inbound);
  } finally {
    if (previous === undefined) delete process.env.CHOICE_HOLDOUT_PCT;
    else process.env.CHOICE_HOLDOUT_PCT = previous;
  }
});
