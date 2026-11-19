import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createCheckoutSession, stripeConfigFromEnv, type StripeConfig } from "../src/tools/stripe.ts";

test("Stripe is optional and never invents a price", () => {
  assert.equal(stripeConfigFromEnv({} as NodeJS.ProcessEnv), null);
});

test("Stripe checkout posts a subscription session", async () => {
  let received: any = null;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      received = { auth: req.headers.authorization, path: req.url, form: new URLSearchParams(body) };
      res.end(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.test/cs_test_1" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const config: StripeConfig = {
      secretKey: "sk_test",
      priceId: "price_123",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 2_000,
    };
    const result = await createCheckoutSession(config, { email: "owner@example.com", tenant: "Acme" });
    assert.equal(result.ok, true);
    assert.equal(result.id, "cs_test_1");
    assert.equal(received.path, "/v1/checkout/sessions");
    assert.equal(received.auth, "Bearer sk_test");
    assert.equal(received.form.get("mode"), "subscription");
    assert.equal(received.form.get("line_items[0][price]"), "price_123");
    assert.equal(received.form.get("customer_email"), "owner@example.com");
    assert.equal(received.form.get("metadata[tenant]"), "Acme");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
