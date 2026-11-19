import { bufferConfigFromEnv, publishToBuffer, type BufferPostResult } from "./buffer.ts";

/**
 * Social publishing is a provider detail.
 *
 * If Buffer is configured, the approved post goes through Buffer's GraphQL API (images and
 * videos included). Otherwise it goes to SOCIAL_WEBHOOK_URL (n8n, Make, Postiz, Buffer).
 */
export interface SocialConfig {
  url?: string;
  token?: string;
  timeoutMs: number;
}

export interface SocialInput {
  text: string;
  platforms: string[];
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  altText?: string;
  scheduledAt?: string;
  channelIds?: string[];
}

export interface SocialResult {
  ok: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
  status?: number;
  provider?: "buffer" | "webhook";
  results?: BufferPostResult[];
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
  input: SocialInput,
): Promise<SocialResult> {
  const buffer = bufferConfigFromEnv();
  if (buffer) {
    const result = await publishToBuffer(buffer, {
      text: input.text,
      imageUrl: input.imageUrl,
      videoUrl: input.videoUrl,
      thumbnailUrl: input.thumbnailUrl,
      altText: input.altText,
      scheduledAt: input.scheduledAt,
      channelIds: input.channelIds,
    });
    return {
      ...result,
      provider: "buffer",
      id: result.results.find((r) => r.ok)?.postId,
    };
  }

  if (!config.url) {
    return { ok: false, skipped: true, error: "Buffer is not configured and SOCIAL_WEBHOOK_URL is empty" };
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
      return { ok: false, status: response.status, provider: "webhook", error: payload.error ?? `social webhook returned ${response.status}` };
    }
    return { ok: true, status: response.status, provider: "webhook", id: payload.id };
  } catch (error) {
    return { ok: false, provider: "webhook", error: error instanceof Error ? error.message : "social publish failed" };
  }
}
