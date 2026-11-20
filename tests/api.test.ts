import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/api/server.ts";

test("HTTP console exposes a working kernel surface", async () => {
  const dir = await mkdtemp(join(tmpdir(), "choiceos-api-"));
  const server = await startServer({ port: 0, dataDir: dir });
  try {
    const health = await (await fetch(`${server.url}/api/health`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.chain.ok, true);

    const state = await (await fetch(`${server.url}/api/state`)).json();
    assert.equal(state.contacts.length, 16);
    assert.ok(state.tenant.name.length > 0);

    const dana = state.contacts.find((c: { name: string }) => c.name === "Dana Whitfield");
    assert.ok(dana);

    let target: any = null;
    let plan: any = null;
    for (const contact of state.contacts) {
      const candidate = await (await fetch(`${server.url}/api/contacts/${contact.id}/plan`)).json();
      if (candidate.decision?.moveId && candidate.decision.moveId !== "wait" && candidate.message?.body?.length > 0) {
        target = contact;
        plan = candidate;
        break;
      }
    }
    assert.ok(target, "expected at least one actionable contact");
    assert.ok(plan.decision.moveId);
    assert.ok(plan.message.body.length > 0);
    assert.equal(plan.verdict.allowed, true);

    const sent = await (
      await fetch(`${server.url}/api/contacts/${target.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: plan.channel }),
      })
    ).json();
    assert.equal(sent.blocked, false);
    assert.ok(sent.action.id.startsWith("act_"));

    const replied = await (
      await fetch(`${server.url}/api/contacts/${target.id}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "How much does it cost?" }),
      })
    ).json();
    assert.equal(replied.intent, "price");

    const html = await (await fetch(`${server.url}/`)).text();
    assert.match(html, /Choice OS/);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
