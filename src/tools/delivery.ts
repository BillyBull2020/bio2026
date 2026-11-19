import type { ActionRecord, Contact } from "../neuro/types.ts";

/**
 * A provider-neutral delivery webhook.
 *
 * Point CHOICE_WEBHOOK_URL at Zapier, n8n, Make, a Twilio proxy, or your own worker. The
 * kernel emits an already-approved action; the receiver owns transport. This keeps the
 * policy gate in front of every real send without hard-coding a vendor SDK.
 */
export interface DeliveryConfig {
  url?: string;
  token?: string;
  timeoutMs: number;
}

export interface DeliveryResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
  provider?: string;
}

export function deliveryConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DeliveryConfig {
  return {
    url: env.CHOICE_WEBHOOK_URL,
    token: env.CHOICE_WEBHOOK_TOKEN,
    timeoutMs: Number(env.CHOICE_WEBHOOK_TIMEOUT_MS ?? 8_000),
  };
}

export async function deliverAction(
  action: ActionRecord,
  contact: Contact,
  config: DeliveryConfig = deliveryConfigFromEnv(),
): Promise<DeliveryResult> {
  if (!config.url) return { ok: false, skipped: true, error: "CHOICE_WEBHOOK_URL not configured" };

  const payload = {
    actionId: action.id,
    contactId: contact.id,
    to: action.channel === "email" ? contact.email : contact.phone,
    channel: action.channel,
    purpose: action.purpose,
    subject: action.subject ?? null,
    body: action.body,
    moveId: action.moveId,
    roleId: action.roleId,
    claimIds: action.claimIds,
    policyAllowed: action.policy.allowed,
    policyCheckedAt: action.policy.checkedAt,
    sentAt: action.at,
    contact: {
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      timezone: contact.timezone,
    },
  };

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `webhook returned ${response.status}` };
    }
    return { ok: true, status: response.status, provider: "webhook" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "delivery failed" };
  }
}
