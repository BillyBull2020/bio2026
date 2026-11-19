import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { deliverAction } from "../src/tools/delivery.ts";
import type { ActionRecord } from "../src/neuro/types.ts";
import { makeContact, NOW } from "./helpers.ts";

function actionFor(contactId: string): ActionRecord {
  return {
    id: "act_test",
    contactId,
    at: NOW,
    moveId: "local_proof",
    roleId: "reviver",
    channel: "sms",
    purpose: "marketing",
    body: "A grounded message with one next step.",
    claimIds: ["claim_alvarez_case"],
    pressure: 0.02,
    policy: { allowed: true, issues: [], checkedAt: NOW },
    decision: {
      id: "dec_test",
      contactId,
      at: NOW,
      moveId: "local_proof",
      score: 1,
      deltaReadiness: 1,
      readinessBefore: 0.4,
      readinessAfter: 0.5,
      binding: "trust",
      bindingDeficit: 0.4,
      system: "social",
      whyNow: "test",
      alternatives: [],
      roleId: "reviver",
      channel: "sms",
      pressure: 0.02,
    },
  };
}

test("delivery is skipped when no webhook is configured", async () => {
  const contact = makeContact();
  const result = await deliverAction(actionFor(contact.id), contact, { timeoutMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
});

test("delivery posts the approved action to a webhook", async () => {
  let received: any = null;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received = JSON.parse(body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const contact = makeContact();
    const result = await deliverAction(actionFor(contact.id), contact, {
      url: `http://127.0.0.1:${port}/send`,
      token: "test-token",
      timeoutMs: 2_000,
    });
    assert.equal(result.ok, true);
    assert.equal(received.actionId, "act_test");
    assert.equal(received.channel, "sms");
    assert.equal(received.to, contact.phone);
    assert.equal(received.body, "A grounded message with one next step.");
    assert.equal(received.policyAllowed, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
