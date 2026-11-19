import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KernelStore, DEFAULT_TENANT } from "../src/kernel/store.ts";
import { SEED_CLAIMS } from "../src/kernel/claims.ts";
import { DEFAULT_SETTINGS } from "../src/kernel/policy.ts";
import { Conductor } from "../src/kernel/conductor.ts";
import { roleCanUseTool, toolById } from "../src/tools/registry.ts";
import { parseCsv, prospectsFromCsv } from "../src/tools/types.ts";

const NOW = "2026-11-19T18:00:00.000Z";
const FIXTURE = join(import.meta.dirname, "fixtures", "sellbird.csv");

test("CSV parser handles quotes, commas and newlines", () => {
  const rows = parseCsv('a,b\n"one, two","he said ""hi"""\n');
  assert.deepEqual(rows[1], ["one, two", 'he said "hi"']);
});

test("Sellbird prospects map without inventing consent", async () => {
  const text = await readFile(FIXTURE, "utf8");
  const prospects = prospectsFromCsv(text);
  assert.equal(prospects.length, 3);
  assert.equal(prospects[0].company, "North Peak Roofing");
  assert.equal(prospects[0].score, 87);
});

test("imported prospects are discovery-only: no consent, zero pressure, wait", async () => {
  const store = new KernelStore({ tenant: DEFAULT_TENANT, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS, persist: false });
  const tool = toolById("sellbird.import")!;
  const result = await tool.run({ file: FIXTURE }, { tenant: store.state.tenant, now: NOW, store });
  assert.equal(result.ok, true);
  assert.equal((result.output as { imported: number }).imported, 2);

  const imported = store.contacts()[0];
  assert.equal(imported.consent.length, 0);
  assert.equal(imported.pressureBudget, 0);
  assert.ok(imported.tags.includes("needs_consent"));

  const conductor = new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS);
  const plan = conductor.planFor(imported.id, NOW);
  assert.equal(plan!.decision.moveId, "wait");
});

test("the proof-video tool writes a manifest and changes no state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "choiceos-proof-"));
  const store = new KernelStore({ tenant: DEFAULT_TENANT, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS, persist: false });
  const contact = store.createContact(
    {
      firstName: "Dana",
      lastName: "Whitfield",
      company: "Whitfield Residence",
      city: "Highlands Ranch",
      phone: "+1 303-555-0117",
      email: "dana@example.com",
      lostCallsPerMonth: 11,
      missedRevenuePerMonth: 31_900,
    },
    NOW,
  );
  const before = store.log.events.length;
  const tool = toolById("hyperframes.proof")!;
  const result = await tool.run({ contactId: contact.id, outDir: dir }, { tenant: store.state.tenant, now: NOW, store });
  assert.equal(result.ok, true);
  const path = (result.output as { path: string }).path;
  const job = JSON.parse(await readFile(path, "utf8"));
  assert.equal(job.durationSeconds, 10);
  assert.ok(job.script.includes("31,900"));
  assert.equal(store.log.events.length, before);
  await rm(dir, { recursive: true, force: true });
});

test("tool permissions are role-scoped", () => {
  assert.equal(roleCanUseTool("analyst", "sellbird.import"), true);
  assert.equal(roleCanUseTool("concierge", "sellbird.import"), false);
  assert.equal(roleCanUseTool("advocate", "hyperframes.proof"), true);
});
