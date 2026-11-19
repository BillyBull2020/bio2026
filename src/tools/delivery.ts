import type { ActionRecord, Contact } from "../neuro/types.ts";

/**
 * Delivery is a provider detail, not a kernel concern.
 *
 * The kernel emits an already-approved action. This module chooses Twilio for SMS, Resend
 * for email, or a generic webhook. If no provider is configured, the action is logged and
 * `skipped` is returned — nothing is silently sent.
 */
export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from?: string;
  messagingServiceSid?: string;
  baseUrl?: string;
}

export interface ResendConfig {
  apiKey: string;
  from: string;
  baseUrl?: string;
}

export interface DeliveryConfig {
  url?: string;
  token?: string;
  timeoutMs: number;
  twilio?: TwilioConfig;
  resend?: ResendConfig;
}

export interface DeliveryResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
  error?: string;
  provider?: string;
  id?: string;
  to?: string;
}

export function deliveryConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DeliveryConfig {
  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  const twilio =
    accountSid && authToken
      ? {
          accountSid,
          authToken,
          from: env.TWILIO_FROM,
          messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
          baseUrl: env.TWILIO_BASE_URL,
        }
      : undefined;
  const resend =
    env.RESEND_API_KEY && env.RESEND_FROM
      ? { apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM, baseUrl: env.RESEND_BASE_URL }
      : undefined;
  return {
    url: env.CHOICE_WEBHOOK_URL,
    token: env.CHOICE_WEBHOOK_TOKEN,
    timeoutMs: Number(env.CHOICE_WEBHOOK_TIMEOUT_MS ?? 8_000),
    twilio,
    resend,
  };
}

export function deliveryChannels(config: DeliveryConfig = deliveryConfigFromEnv()): {
  sms: boolean;
  email: boolean;
  webhook: boolean;
} {
  return { sms: Boolean(config.twilio), email: Boolean(config.resend), webhook: Boolean(config.url) };
}

async function sendTwilio(
  action: ActionRecord,
  contact: Contact,
  config: TwilioConfig,
  timeoutMs: number,
): Promise<DeliveryResult> {
  const base = config.baseUrl ?? "https://api.twilio.com";
  const form = new URLSearchParams({ To: contact.phone, Body: action.body });
  if (config.messagingServiceSid) form.set("MessagingServiceSid", config.messagingServiceSid);
  else if (config.from) form.set("From", config.from);
  else return { ok: false, provider: "twilio", error: "TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID is required" };

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  try {
    const response = await fetch(`${base}/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = (await response.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!response.ok) {
      return { ok: false, provider: "twilio", status: response.status, error: payload.message ?? `Twilio returned ${response.status}` };
    }
    return { ok: true, provider: "twilio", status: response.status, id: payload.sid, to: contact.phone };
  } catch (error) {
    return { ok: false, provider: "twilio", error: error instanceof Error ? error.message : "Twilio send failed" };
  }
}

async function sendResend(
  action: ActionRecord,
  contact: Contact,
  config: ResendConfig,
  timeoutMs: number,
): Promise<DeliveryResult> {
  const base = config.baseUrl ?? "https://api.resend.com";
  try {
    const response = await fetch(`${base}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: contact.email,
        subject: action.subject ?? "A note from your contractor",
        text: action.body,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!response.ok) {
      return { ok: false, provider: "resend", status: response.status, error: payload.message ?? `Resend returned ${response.status}` };
    }
    return { ok: true, provider: "resend", status: response.status, id: payload.id, to: contact.email };
  } catch (error) {
    return { ok: false, provider: "resend", error: error instanceof Error ? error.message : "Resend send failed" };
  }
}

export async function deliverAction(
  action: ActionRecord,
  contact: Contact,
  config: DeliveryConfig = deliveryConfigFromEnv(),
): Promise<DeliveryResult> {
  if (action.channel === "sms" && config.twilio) return sendTwilio(action, contact, config.twilio, config.timeoutMs);
  if (action.channel === "email" && config.resend) return sendResend(action, contact, config.resend, config.timeoutMs);

  if (!config.url) {
    return {
      ok: false,
      skipped: true,
      error:
        action.channel === "sms"
          ? "Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM)"
          : action.channel === "email"
            ? "Resend is not configured (RESEND_API_KEY / RESEND_FROM)"
            : "No delivery provider is configured",
    };
  }

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
      return { ok: false, status: response.status, provider: "webhook", error: `webhook returned ${response.status}` };
    }
    return { ok: true, status: response.status, provider: "webhook" };
  } catch (error) {
    return { ok: false, provider: "webhook", error: error instanceof Error ? error.message : "delivery failed" };
  }
}
