import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/api/server.ts";

const json = async (res: Response) => {
  const body = await res.json();
  assert.equal(res.ok, true, JSON.stringify(body));
  return body;
};

test("every JSON endpoint answers on a fresh kernel", async () => {
  const dir = await mkdtemp(join(tmpdir(), "choiceos-surface-"));
  const server = await startServer({ port: 0, dataDir: dir });
  try {
    const base = server.url;

    await json(await fetch(`${base}/api/health`));
    const state = await json(await fetch(`${base}/api/state`));
    const business = await json(await fetch(`${base}/api/business`));
    assert.equal(state.contacts.length, 16);
    assert.equal(business.phases.length, 3);

    await json(await fetch(`${base}/api/contacts`));
    await json(await fetch(`${base}/api/policy`));
    await json(await fetch(`${base}/api/metrics`));
    await json(await fetch(`${base}/api/events?limit=5`));
    const setup = await json(await fetch(`${base}/api/setup/status`));
    assert.equal(setup.checklist.length, 7);
    assert.equal(typeof setup.channels.sms, "boolean");
    assert.equal(setup.counts.contacts, 16);
    const calendar = await fetch(`${base}/api/calendar/slots`);
    assert.equal(calendar.status, 400);
    const experiment = await json(await fetch(`${base}/api/experiment`));
    assert.equal(experiment.treatment.contacts + experiment.holdout.contacts, 14);
    const operator = await json(await fetch(`${base}/api/operator/status`));
    assert.equal(operator.types.length, 6);

    const dana = state.contacts.find((c: { name: string }) => c.name === "Dana Whitfield");
    const priya = state.contacts.find((c: { name: string }) => c.name === "Priya Raman");
    assert.ok(dana && priya);

    const detail = await json(await fetch(`${base}/api/contacts/${dana.id}`));
    assert.equal(detail.contact.id, dana.id);
    const plan = await json(await fetch(`${base}/api/contacts/${dana.id}/plan`));
    assert.ok(plan.decision.moveId);

    const rewrite = await json(
      await fetch(`${base}/api/contacts/${dana.id}/rewrite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: plan.message.body }),
      }),
    );
    assert.equal(rewrite.usedModel, false);
    assert.equal(rewrite.body, plan.message.body);

    const sent = await json(
      await fetch(`${base}/api/contacts/${dana.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel: plan.channel }),
      }),
    );
    assert.equal(sent.blocked, false);

    const replied = await json(
      await fetch(`${base}/api/contacts/${priya.id}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "How much is it?" }),
      }),
    );
    assert.equal(replied.intent, "price");

    await json(
      await fetch(`${base}/api/contacts/${priya.id}/consent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "marketing", channel: "sms", granted: true }),
      }),
    );

    await json(
      await fetch(`${base}/api/contacts/${priya.id}/optout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );

    const tick = await json(
      await fetch(`${base}/api/tick`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 2 }),
      }),
    );
    assert.ok(Array.isArray(tick.results));

    const day = await json(
      await fetch(`${base}/api/run-day`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 3 }),
      }),
    );
    assert.ok(day.summary);

    const reload = await json(
      await fetch(`${base}/api/reload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(reload.ok, true);

    const sim = await json(
      await fetch(`${base}/api/simulate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contacts: 100, days: 7, seeds: 1 }),
      }),
    );
    assert.ok(sim.baseline && sim.choiceos);
    await json(await fetch(`${base}/api/simulate`));

    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /Choice OS/);

    const before = (await json(await fetch(`${base}/api/state`))).contacts.length;
    const webhook = await fetch(`${base}/webhooks/twilio`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        From: "+1 303-555-0199",
        Body: "My roof is leaking. Can you come look?",
        MessageSid: "SM_TEST_INBOUND",
      }).toString(),
    });
    assert.equal(webhook.status, 200);
    assert.match(await webhook.text(), /<Response>/);
    const after = (await json(await fetch(`${base}/api/state`))).contacts.length;
    assert.equal(after, before + 1);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
