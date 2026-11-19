/**
 * CRM sync is an outbound webhook, not a second CRM.
 *
 * Point CRM_WEBHOOK_URL at n8n, Make, Zapier, Airtable Automations, or your own worker. The
 * receiver owns the CRM mapping. The OS sends the book on demand, never on a timer, so a
 * misconfigured CRM cannot silently mutate the source of truth.
 */
export interface CrmConfig {
  url?: string;
  token?: string;
  timeoutMs: number;
}

export interface CrmBook {
  tenant: string;
  contacts: Array<Record<string, unknown>>;
  bookings: Array<Record<string, unknown>>;
}

export function crmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CrmConfig {
  return {
    url: env.CRM_WEBHOOK_URL,
    token: env.CRM_WEBHOOK_TOKEN,
    timeoutMs: Number(env.CRM_WEBHOOK_TIMEOUT_MS ?? 15_000),
  };
}

export async function syncBook(
  config: CrmConfig,
  book: CrmBook,
): Promise<{ ok: boolean; skipped?: boolean; status?: number; error?: string }> {
  if (!config.url) return { ok: false, skipped: true, error: "CRM_WEBHOOK_URL is not configured" };
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify(book),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `CRM webhook returned ${response.status}` };
    }
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "CRM sync failed" };
  }
}
