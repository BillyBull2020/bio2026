/**
 * Social publishing is a provider detail.
 *
 * Point SOCIAL_WEBHOOK_URL at n8n, Make, Postiz, Buffer, or your own worker. The Operator
 * sends an approved post; the receiver owns the platform credentials. If it is not configured,
 * the task is marked skipped rather than pretending it was published.
 */
export interface SocialConfig {
  url?: string;
  token?: string;
  timeoutMs: number;
}

export function socialConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SocialConfig {
  return {
    url: env.SOCIAL_WEBHOOK_URL,
    token: env.SOCIAL_WEBHOOK_TOKEN,
    timeoutMs: Number(env.SOCIAL_WEBHOOK_TIMEOUT_MS ?? 10_000),
  };
}

export async function publishSocial(
  config: SocialConfig,
  input: { text: string; platforms: string[]; imageUrl?: string },
): Promise<{ ok: boolean; skipped?: boolean; id?: string; error?: string; status?: number }> {
  if (!config.url) {
    return { ok: false, skipped: true, error: "SOCIAL_WEBHOOK_URL is not configured" };
  }
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({ ...input, approved: true }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!response.ok) {
      return { ok: false, status: response.status, error: payload.error ?? `social webhook returned ${response.status}` };
    }
    return { ok: true, status: response.status, id: payload.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "social publish failed" };
  }
}
