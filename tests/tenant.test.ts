import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KernelStore, loadTenant } from "../src/kernel/store.ts";
import { DEFAULT_SETTINGS } from "../src/kernel/policy.ts";

test("a tenant.json brands the store for a real customer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "choiceos-tenant-"));
  try {
    await writeFile(
      join(dir, "tenant.json"),
      JSON.stringify({ name: "Acme Roofing", city: "Aurora", trade: "roofing", avgTicket: 12000 }),
      "utf8",
    );
    const tenant = loadTenant(dir);
    assert.equal(tenant.name, "Acme Roofing");
    assert.equal(tenant.city, "Aurora");
    assert.equal(tenant.avgTicket, 12000);
    assert.equal(tenant.state, "CO");

    const store = new KernelStore({ dataDir: dir, claims: [], settings: DEFAULT_SETTINGS, persist: false });
    assert.equal(store.state.tenant.name, "Acme Roofing");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a missing tenant.json falls back to the demo tenant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "choiceos-tenant-empty-"));
  try {
    const tenant = loadTenant(dir);
    assert.equal(tenant.name, "Summit Ridge Roofing");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
