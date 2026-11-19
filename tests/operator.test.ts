import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { OPERATOR_TYPES } from "../src/operator/runner.ts";
import { publishSocial } from "../src/tools/social.ts";

test("operator types expose the approval boundary", () => {
  assert.equal(OPERATOR_TYPES.length, 6);
  assert.equal(OPERATOR_TYPES.find((t) => t.id === "send_email")?.approval, true);
  assert.equal(OPERATOR_TYPES.find((t) => t.id === "social_publish")?.approval, true);
  assert.equal(OPERATOR_TYPES.find((t) => t.id === "prospect_research")?.approval, false);
  assert.equal(OPERATOR_TYPES.find((t) => t.id === "social_calendar")?.approval, false);
});

test("social publishing is skipped when no webhook is configured", async () => {
  const result = await publishSocial({ timeoutMs: 500 }, { text: "test", platforms: ["facebook"] });
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
});

test("social publishing posts an approved payload", async () => {
  let received: any = null;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received = { auth: req.headers.authorization, body: JSON.parse(body) };
      res.end(JSON.stringify({ id: "post_1" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const result = await publishSocial(
      { url: `http://127.0.0.1:${port}/social`, token: "social_test", timeoutMs: 2_000 },
      { text: "A specific post.", platforms: ["facebook", "instagram"] },
    );
    assert.equal(result.ok, true);
    assert.equal(result.id, "post_1");
    assert.equal(received.auth, "Bearer social_test");
    assert.equal(received.body.approved, true);
    assert.deepEqual(received.body.platforms, ["facebook", "instagram"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
