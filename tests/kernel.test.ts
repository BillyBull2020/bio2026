import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KernelStore, DEFAULT_TENANT } from "../src/kernel/store.ts";
import { seedDemo } from "../src/kernel/seed.ts";
import { SEED_CLAIMS } from "../src/kernel/claims.ts";
import { DEFAULT_SETTINGS } from "../src/kernel/policy.ts";
import { Conductor } from "../src/kernel/conductor.ts";
import { readiness } from "../src/neuro/field.ts";

const NOW = new Date("2026-11-19T18:00:00.000Z").toISOString();

async function seededStore() {
  const dir = await mkdtemp(join(tmpdir(), "choiceos-"));
  const store = new KernelStore({ tenant: DEFAULT_TENANT, dataDir: dir, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS });
  seedDemo(store, NOW);
  return { dir, store };
}

test("seed builds a coherent, hash-chained book", async () => {
  const { dir, store } = await seededStore();
  try {
    assert.equal(store.contacts().length, 16);
    assert.ok(store.log.events.length > 80);
    assert.equal(store.log.verify().ok, true);
    assert.equal(store.state.bookings.length, 1);
    assert.equal(store.contacts().filter((c) => c.optedOut).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("replay reproduces contacts, fields and actions", async () => {
  const { dir, store } = await seededStore();
  try {
    const dana = store.contacts().find((c) => c.firstName === "Dana")!;
    const before = { trust: dana.field.trust, readiness: readiness(dana.field) };
    const conductor = new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS);
    conductor.dispatch(dana.id, NOW);

    const replayed = new KernelStore({ tenant: DEFAULT_TENANT, dataDir: dir, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS });
    const again = replayed.contacts().find((c) => c.firstName === "Dana")!;
    assert.equal(replayed.contacts().length, store.contacts().length);
    assert.equal(replayed.state.actions.length, store.state.actions.length);
    assert.ok(Math.abs(again.field.trust - before.trust) < 0.0001);
    assert.equal(replayed.log.verify().ok, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("dispatch writes both a decision and an action", async () => {
  const { dir, store } = await seededStore();
  try {
    const conductor = new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS);
    const dana = store.contacts().find((c) => c.firstName === "Dana")!;
    const result = conductor.dispatch(dana.id, NOW);
    assert.ok(result);
    assert.ok(result!.action);
    assert.equal(store.state.decisions.length, 1);
    assert.equal(store.state.actions.length, 1);
    assert.ok(result!.action!.body.length > 20);
    assert.equal(store.log.verify().ok, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("STOP is honoured immediately and globally", async () => {
  const { dir, store } = await seededStore();
  try {
    const conductor = new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS);
    const priya = store.contacts().find((c) => c.firstName === "Priya")!;
    const result = conductor.handleReply(priya.id, "STOP", NOW);
    assert.equal(result!.intent, "stop");
    assert.equal(result!.optedOut, true);
    assert.equal(store.getContact(priya.id)!.optedOut, true);
    const after = conductor.planFor(priya.id, NOW);
    assert.equal(after!.decision.moveId, "wait");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a booking reply creates a booking and sends a confirmation", async () => {
  const { dir, store } = await seededStore();
  try {
    const conductor = new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS);
    const tom = store.contacts().find((c) => c.firstName === "Tom")!;
    const before = store.state.bookings.length;
    const result = conductor.handleReply(tom.id, "Tuesday works, let's do it", NOW);
    assert.equal(result!.intent, "book");
    assert.ok(store.state.bookings.length > before);
    assert.ok(result!.action);
    assert.match(result!.action!.body, /set for|confirmed/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an inbound reply re-plans on the reply, not on a stale state", async () => {
  const { dir, store } = await seededStore();
  try {
    const conductor = new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS);
    const priya = store.contacts().find((c) => c.firstName === "Priya")!;
    const trustBefore = priya.field.trust;
    conductor.handleReply(priya.id, "How much is it?", NOW);
    assert.ok(store.getContact(priya.id)!.field.trust >= trustBefore);
    assert.ok(store.state.replies.length === 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the event chain detects tampering", async () => {
  const { dir, store } = await seededStore();
  try {
    store.log.events[3].payload = { tampered: true };
    const verified = store.log.verify();
    assert.equal(verified.ok, false);
    assert.equal(verified.brokenAt, 4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
