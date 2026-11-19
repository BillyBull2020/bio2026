import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { crmConfigFromEnv, syncBook } from "../src/tools/crm.ts";

test("CRM sync is skipped when no webhook is configured", async () => {
  assert.equal(crmConfigFromEnv({} as NodeJS.ProcessEnv).url, undefined);
  const result = await syncBook({ timeoutMs: 500 }, { tenant: "Acme", contacts: [], bookings: [] });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
});

test("CRM sync posts the book to the configured webhook", async () => {
  let received: any = null;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received = { auth: req.headers.authorization, body: JSON.parse(body) };
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const result = await syncBook(
      { url: `http://127.0.0.1:${port}/crm`, token: "crm_test", timeoutMs: 2_000 },
      { tenant: "Acme", contacts: [{ id: "ct_1" }], bookings: [{ id: "bk_1" }] },
    );
    assert.equal(result.ok, true);
    assert.equal(received.auth, "Bearer crm_test");
    assert.equal(received.body.tenant, "Acme");
    assert.equal(received.body.contacts[0].id, "ct_1");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
