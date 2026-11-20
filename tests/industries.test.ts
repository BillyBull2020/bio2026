import test from "node:test";
import assert from "node:assert/strict";
import { INDUSTRIES, industryList, industryPreset } from "../src/kernel/industries.ts";

test("industry presets cover the target trades", () => {
  const list = industryList();
  assert.ok(list.some((p) => p.id === "roofing"));
  assert.ok(list.some((p) => p.id === "hvac"));
  assert.ok(list.some((p) => p.id === "plumbing"));
  assert.ok(list.some((p) => p.id === "restoration"));
  assert.equal(industryPreset("HVAC")?.avgTicket, 9_500);
  assert.equal(INDUSTRIES.roofing?.avgTicket, 14_500);
});

test("an unknown industry is explicit", () => {
  assert.equal(industryPreset("underwater-basket-weaving"), undefined);
});
