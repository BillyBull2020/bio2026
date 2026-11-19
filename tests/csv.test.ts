import test from "node:test";
import assert from "node:assert/strict";
import { KernelStore, DEFAULT_TENANT } from "../src/kernel/store.ts";
import { DEFAULT_SETTINGS } from "../src/kernel/policy.ts";
import { importContactsFromCsv } from "../src/tools/csv.ts";
import { NOW } from "./helpers.ts";

function store(): KernelStore {
  return new KernelStore({ tenant: DEFAULT_TENANT, claims: [], settings: DEFAULT_SETTINGS, persist: false });
}

const CSV = `first_name,last_name,email,phone,company,city,state,consent_sms,consent_email,consent_source,ticket,last_service
Ada,One,ada@example.com,+1 303-555-0111,Acme Roofing,Denver,CO,yes,,website form,12000,2025-04-02
Bob,Two,bob@example.com,+1 303-555-0122,Beta Exteriors,Denver,CO,no,no,,8000,2024-09-18`;

test("CSV import records consent only where it was actually given", () => {
  const s = store();
  const summary = importContactsFromCsv(s, CSV, NOW);
  assert.equal(summary.imported, 2);
  assert.equal(summary.withConsent, 1);
  assert.equal(summary.withoutConsent, 1);

  const ada = s.contacts().find((c) => c.email === "ada@example.com");
  const bob = s.contacts().find((c) => c.email === "bob@example.com");
  assert.ok(ada && bob);
  assert.equal(ada.consent.filter((x) => x.granted).length, 1);
  assert.equal(ada.consent[0]?.channel, "sms");
  assert.equal(ada.consent[0]?.source, "website form");
  assert.equal(ada.pressureBudget, 3);
  assert.equal(bob.consent.length, 0);
  assert.equal(bob.pressureBudget, 0);
  assert.ok(bob.tags.includes("needs_consent"));
  assert.match(bob.notes, /Last service: 2024-09-18/);
});

test("CSV import deduplicates by email or phone", () => {
  const s = store();
  importContactsFromCsv(s, CSV, NOW);
  const second = importContactsFromCsv(s, CSV, NOW);
  assert.equal(second.imported, 0);
  assert.equal(second.skippedExisting, 2);
  assert.equal(s.contacts().length, 2);
});

test("CSV import skips rows with neither email nor phone", () => {
  const s = store();
  const summary = importContactsFromCsv(s, "first_name,company\nNoContact,Nowhere", NOW);
  assert.equal(summary.imported, 0);
  assert.equal(summary.skippedNoContact, 1);
});
