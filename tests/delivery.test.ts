import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { deliverAction, deliveryChannels } from "../src/tools/delivery.ts";
import type { ActionRecord, Channel } from "../src/neuro/types.ts";
import { makeContact, NOW } from "./helpers.ts";

function actionFor(contactId: string, channel: Channel = "sms"): ActionRecord {
  return {
    id: "act_test",
    contactId,
    at: NOW,
    moveId: "local_proof",
    roleId: "reviver",
    channel,
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
      channel,
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

test("Twilio sends an SMS with form-encoded credentials", async () => {
  let received: { path?: string; auth?: string; body?: string } = {};
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received = { path: req.url, auth: req.headers.authorization, body };
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ sid: "SM_TEST_123" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const contact = makeContact();
    const result = await deliverAction(actionFor(contact.id, "sms"), contact, {
      timeoutMs: 2_000,
      twilio: {
        accountSid: "AC_TEST",
        authToken: "token_test",
        from: "+13035550100",
        baseUrl: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.provider, "twilio");
    assert.equal(result.id, "SM_TEST_123");
    assert.equal(received.path, "/2010-04-01/Accounts/AC_TEST/Messages.json");
    assert.match(received.auth ?? "", /^Basic /);
    assert.match(received.body ?? "", /To=%2B1/);
    assert.match(received.body ?? "", /Body=A\+grounded/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Resend sends an email as JSON", async () => {
  let received: any = null;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received = { path: req.url, auth: req.headers.authorization, body: JSON.parse(body) };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "email_test_123" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const contact = makeContact();
    const result = await deliverAction(actionFor(contact.id, "email"), contact, {
      timeoutMs: 2_000,
      resend: {
        apiKey: "re_test",
        from: "ray@example.com",
        baseUrl: `http://127.0.0.1:${port}`,
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.provider, "resend");
    assert.equal(result.id, "email_test_123");
    assert.equal(received.path, "/emails");
    assert.equal(received.auth, "Bearer re_test");
    assert.equal(received.body.to, contact.email);
    assert.ok(received.body.subject);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("channel availability reflects configured providers", () => {
  assert.deepEqual(deliveryChannels({ timeoutMs: 1000 }), { sms: false, email: false, webhook: false });
  assert.deepEqual(
    deliveryChannels({
      timeoutMs: 1000,
      twilio: { accountSid: "a", authToken: "b", from: "c" },
      resend: { apiKey: "k", from: "f" },
      url: "https://example.test/hook",
    }),
    { sms: true, email: true, webhook: true },
  );
});
