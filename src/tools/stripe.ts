/**
 * Stripe Checkout for the pilot. No SDK.
 *
 * The OS creates a subscription Checkout Session; Stripe hosts the card form. The secret key
 * stays on the server. If it is not configured, the endpoint says so instead of inventing a
 * payment link.
 */
export interface StripeConfig {
  secretKey: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  baseUrl: string;
  timeoutMs: number;
}

export interface CheckoutResult {
  ok: boolean;
  url?: string;
  id?: string;
  error?: string;
}

export function stripeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StripeConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY;
  const priceId = env.STRIPE_PRICE_ID;
  if (!secretKey || !priceId) return null;
  const appUrl = (env.CHOICE_PUBLIC_URL ?? "http://127.0.0.1:4177").replace(/\/$/, "");
  return {
    secretKey,
    priceId,
    successUrl: env.STRIPE_SUCCESS_URL ?? `${appUrl}/?billing=success`,
    cancelUrl: env.STRIPE_CANCEL_URL ?? `${appUrl}/?billing=cancelled`,
    baseUrl: env.STRIPE_BASE_URL ?? "https://api.stripe.com",
    timeoutMs: Number(env.STRIPE_TIMEOUT_MS ?? 10_000),
  };
}

export async function createCheckoutSession(
  config: StripeConfig,
  input: { email?: string; tenant?: string } = {},
): Promise<CheckoutResult> {
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", config.priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", config.successUrl);
  form.set("cancel_url", config.cancelUrl);
  form.set("allow_promotion_codes", "true");
  form.set("metadata[tenant]", input.tenant ?? "unknown");
  if (input.email) form.set("customer_email", input.email);

  try {
    const response = await fetch(`${config.baseUrl}/v1/checkout/sessions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      url?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      return { ok: false, error: payload.error?.message ?? `Stripe returned ${response.status}` };
    }
    return { ok: true, id: payload.id, url: payload.url };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Stripe checkout failed" };
  }
}
