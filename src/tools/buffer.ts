/**
 * Buffer GraphQL adapter.
 *
 * Buffer's official n8n node uses this shape: POST https://api.buffer.com/graphql with a
 * bearer API key, and a `createPost` mutation containing `assets: [{ image: { url } }]` or
 * `assets: [{ video: { url, thumbnailUrl } }]`.
 *
 * The OS keeps Buffer as the scheduler, not as a second brain. A post is only sent after the
 * Operator approval.
 */
export interface BufferConfig {
  apiKey: string;
  organizationId?: string;
  channelIds: string[];
  apiUrl: string;
  shareMode: "shareNow" | "addToQueue" | "shareNext" | "customScheduled";
  timeoutMs: number;
}

export interface BufferPostInput {
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  altText?: string;
  channelIds?: string[];
  scheduledAt?: string;
}

export interface BufferPostResult {
  channelId: string;
  ok: boolean;
  postId?: string;
  error?: string;
}

export interface BufferResult {
  ok: boolean;
  provider: "buffer";
  results: BufferPostResult[];
  error?: string;
}

export function bufferConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BufferConfig | null {
  const apiKey = env.BUFFER_API_KEY;
  if (!apiKey) return null;
  const channelIds = (env.BUFFER_CHANNEL_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    apiKey,
    organizationId: env.BUFFER_ORGANIZATION_ID,
    channelIds,
    apiUrl: env.BUFFER_API_URL ?? "https://api.buffer.com/graphql",
    shareMode: (env.BUFFER_SHARE_MODE as BufferConfig["shareMode"]) ?? "addToQueue",
    timeoutMs: Number(env.BUFFER_TIMEOUT_MS ?? 15_000),
  };
}

async function graphql(
  config: BufferConfig,
  query: string,
  variables?: Record<string, unknown>,
): Promise<any> {
  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(variables ? { query, variables } : { query }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) throw new Error(payload?.error?.message ?? `Buffer returned ${response.status}`);
  if (payload.errors?.length) throw new Error(payload.errors[0]?.message ?? "Buffer GraphQL error");
  return payload.data;
}

export async function listBufferChannels(config: BufferConfig): Promise<Array<{ id: string; name: string; service: string; type: string; isDisconnected: boolean }>> {
  if (!config.organizationId) throw new Error("BUFFER_ORGANIZATION_ID is required to list channels");
  const data = await graphql(
    config,
    `query GetChannels($input: ChannelsInput!) {
      channels(input: $input) { id name service type isDisconnected }
    }`,
    { input: { organizationId: config.organizationId, filter: { isLocked: false } } },
  );
  return data?.channels ?? [];
}

const CREATE_POST = `
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess {
      post { id status text dueAt sentAt channelId externalLink assets { id type mimeType source thumbnail } }
    }
    ... on InvalidInputError { message }
    ... on UnauthorizedError { message }
    ... on UnexpectedError { message }
    ... on NotFoundError { message }
    ... on LimitReachedError { message }
    ... on RestProxyError { message code link }
  }
}`;

export async function publishToBuffer(config: BufferConfig, input: BufferPostInput): Promise<BufferResult> {
  const channelIds = input.channelIds?.length ? input.channelIds : config.channelIds;
  if (channelIds.length === 0) {
    return { ok: false, provider: "buffer", results: [], error: "BUFFER_CHANNEL_IDS is empty" };
  }
  if (input.imageUrl && input.videoUrl) {
    return { ok: false, provider: "buffer", results: [], error: "Buffer accepts one media attachment per post" };
  }

  const assets = input.imageUrl
    ? [{ image: { url: input.imageUrl, ...(input.altText ? { metadata: { altText: input.altText } } : {}) } }]
    : input.videoUrl
      ? [{ video: { url: input.videoUrl, ...(input.thumbnailUrl ? { thumbnailUrl: input.thumbnailUrl } : {}) } }]
      : [];

  const results: BufferPostResult[] = [];
  for (const channelId of channelIds) {
    const postInput: Record<string, unknown> = {
      channelId,
      mode: input.scheduledAt ? "customScheduled" : config.shareMode,
      schedulingType: "automatic",
      text: input.text,
      assets,
    };
    if (input.scheduledAt) postInput.dueAt = new Date(input.scheduledAt).toISOString();
    try {
      const data = await graphql(config, CREATE_POST, { input: postInput });
      const result = data?.createPost;
      if (result?.message) {
        results.push({ channelId, ok: false, error: result.message });
        continue;
      }
      results.push({ channelId, ok: true, postId: result?.post?.id });
    } catch (error) {
      results.push({ channelId, ok: false, error: error instanceof Error ? error.message : "Buffer post failed" });
    }
  }
  return { ok: results.every((r) => r.ok), provider: "buffer", results };
}
