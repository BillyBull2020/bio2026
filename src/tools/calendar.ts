/**
 * Cal.diy / Cal.com v2 adapter.
 *
 * Cal.diy is the MIT self-hosted community edition. Its API is the Cal.com v2 API, so the
 * same adapter works against a local Cal.diy container or a hosted Cal.com account.
 *
 * It only reads availability and creates a booking after the kernel has approved the move.
 * It never decides who to contact.
 */
export interface CalendarConfig {
  baseUrl: string;
  apiKey: string;
  eventTypeId: string;
  timeZone: string;
  timeoutMs: number;
}

export interface CalendarSlot {
  start: string;
  end?: string;
  label: string;
}

export interface SlotFacts {
  slotA: string;
  slotB: string;
  deadline: string;
}

export interface BookingInput {
  start: string;
  name: string;
  email?: string;
  phone?: string;
  timeZone: string;
  notes?: string;
  contactId?: string;
}

export interface BookingResult {
  ok: boolean;
  uid?: string;
  start?: string;
  error?: string;
}

export interface ReservationResult {
  ok: boolean;
  uid?: string;
  start?: string;
  error?: string;
}

export function calendarConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CalendarConfig | null {
  const baseUrl = env.CALCOM_BASE_URL;
  const apiKey = env.CALCOM_API_KEY;
  const eventTypeId = env.CALCOM_EVENT_TYPE_ID;
  if (!baseUrl || !apiKey || !eventTypeId) return null;
  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey,
    eventTypeId,
    timeZone: env.CALCOM_TIMEZONE ?? "America/Denver",
    timeoutMs: Number(env.CALCOM_TIMEOUT_MS ?? 8_000),
  };
}

function label(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export async function getAvailableSlots(
  config: CalendarConfig,
  now: string,
  days = 10,
): Promise<CalendarSlot[]> {
  const start = new Date(Date.parse(now) + 86_400_000).toISOString();
  const end = new Date(Date.parse(now) + days * 86_400_000).toISOString();
  const url = new URL(`${config.baseUrl}/v2/slots`);
  url.searchParams.set("eventTypeId", config.eventTypeId);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  url.searchParams.set("timeZone", config.timeZone);

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "cal-api-version": "2024-09-04",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) throw new Error(`Cal.diy slots returned ${response.status}`);
  const payload = (await response.json()) as { data?: Record<string, Array<{ start: string; end?: string }>> };
  const daysMap = payload.data ?? {};
  const slots: CalendarSlot[] = [];
  for (const items of Object.values(daysMap)) {
    for (const item of items) {
      if (!item?.start) continue;
      slots.push({ start: item.start, end: item.end, label: label(item.start, config.timeZone) });
    }
  }
  return slots.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export async function slotFacts(config: CalendarConfig, now: string): Promise<SlotFacts | null> {
  const slots = await getAvailableSlots(config, now);
  if (slots.length === 0) return null;
  const first = slots[0]!;
  const second = slots.find((s) => s.start !== first.start) ?? slots[0]!;
  return { slotA: first.label, slotB: second.label, deadline: first.start };
}

export async function reserveSlot(
  config: CalendarConfig,
  start: string,
  reservationDuration = 60,
): Promise<ReservationResult> {
  try {
    const response = await fetch(`${config.baseUrl}/v2/slots/reservations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "cal-api-version": "2024-09-04",
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        eventTypeId: Number(config.eventTypeId),
        slotStart: start,
        reservationDuration,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { uid?: string; start?: string };
      error?: { message?: string };
    };
    if (!response.ok) {
      return { ok: false, error: payload.error?.message ?? `Cal.diy reservation returned ${response.status}` };
    }
    return { ok: true, uid: payload.data?.uid, start: payload.data?.start ?? start };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Cal.diy reservation failed" };
  }
}

export async function reserveTwoSlots(
  config: CalendarConfig,
  now: string,
): Promise<{ ok: boolean; starts: string[]; uids: string[]; error?: string }> {
  const slots = await getAvailableSlots(config, now);
  const picks = slots.slice(0, 2);
  if (picks.length < 2) return { ok: false, starts: [], uids: [], error: "Fewer than two available slots" };
  const results = await Promise.all(picks.map((slot) => reserveSlot(config, slot.start)));
  const failed = results.find((r) => !r.ok);
  return {
    ok: !failed,
    starts: picks.map((s) => s.start),
    uids: results.map((r) => r.uid).filter((x): x is string => Boolean(x)),
    error: failed?.error,
  };
}

export async function createBooking(
  config: CalendarConfig,
  input: BookingInput,
): Promise<BookingResult> {
  try {
    const response = await fetch(`${config.baseUrl}/v2/bookings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "cal-api-version": "2024-08-13",
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        start: input.start,
        eventTypeId: Number(config.eventTypeId),
        attendee: {
          name: input.name,
          timeZone: input.timeZone,
          ...(input.email ? { email: input.email } : {}),
          ...(input.phone ? { phoneNumber: input.phone } : {}),
          language: "en",
        },
        ...(input.notes ? { bookingFieldsResponses: { notes: input.notes } } : {}),
        ...(input.contactId ? { metadata: { contactId: input.contactId } } : {}),
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      data?: { uid?: string; start?: string };
      error?: { message?: string };
    };
    if (!response.ok) {
      return { ok: false, error: payload.error?.message ?? `Cal.diy booking returned ${response.status}` };
    }
    return { ok: true, uid: payload.data?.uid, start: payload.data?.start };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Cal.diy booking failed" };
  }
}
