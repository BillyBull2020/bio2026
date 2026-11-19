import type { Channel, Consent, Purpose, SignalType } from "../neuro/types.ts";
import type { KernelStore, NewContactInput } from "./store.ts";

interface SeedConsent {
  purpose: Purpose;
  channel: Channel;
  granted?: boolean;
  source?: string;
  hoursAgo?: number;
}

interface SeedSignal {
  type: SignalType;
  hoursAgo: number;
  detail?: string;
  source?: string;
}

interface SeedContact {
  input: NewContactInput;
  consents: SeedConsent[];
  signals: SeedSignal[];
  optOut?: { hoursAgo: number; reason: string };
}

const HOUR = 3_600_000;
const at = (now: string, hoursAgo: number) => new Date(Date.parse(now) - hoursAgo * HOUR).toISOString();

/**
 * A believable Denver roofing book of business: past customers, a few live
 * leads, one vulnerable contact, one complaint, one opt-out. Enough variety to
 * exercise every rail in the console.
 */
const SEED: SeedContact[] = [
  {
    input: {
      firstName: "Dana",
      lastName: "Whitfield",
      company: "Whitfield Residence",
      city: "Highlands Ranch",
      phone: "+1 303-555-0117",
      email: "dana.whitfield@example.com",
      channelPreference: "sms",
      lostCallsPerMonth: 11,
      missedRevenuePerMonth: 31_900,
      tags: ["past_customer", "roof_2019"],
      notes: "Roof replaced in 2019. Called twice last week about a leak.",
      createdAt: at(new Date().toISOString(), 24 * 800),
      pressureSpent: 0.4,
    },
    consents: [
      { purpose: "marketing", channel: "sms", source: "inbound call, 2026-09-12" },
      { purpose: "marketing", channel: "email", source: "inbound call, 2026-09-12" },
      { purpose: "marketing", channel: "voice", source: "inbound call, 2026-11-17" },
    ],
    signals: [
      { type: "job_completed", hoursAgo: 24 * 800, detail: "full tear-off, 2019" },
      { type: "missed_call", hoursAgo: 52, detail: "called the office twice, no callback" },
      { type: "form_fill", hoursAgo: 30, detail: "requested a leak inspection" },
    ],
  },
  {
    input: {
      firstName: "Luis",
      lastName: "Ortega",
      company: "Ortega Rental Co.",
      city: "Aurora",
      phone: "+1 303-555-0188",
      email: "luis@ortegarental.example",
      channelPreference: "voice",
      lostCallsPerMonth: 7,
      missedRevenuePerMonth: 14_210,
      tags: ["missed_call", "property_manager"],
      notes: "Manages six rentals. Called at 7:40am and hung up.",
      createdAt: at(new Date().toISOString(), 24 * 240),
    },
    consents: [
      { purpose: "marketing", channel: "voice", source: "inbound call, 2026-11-19" },
      { purpose: "marketing", channel: "sms", source: "inbound call, 2026-11-19" },
    ],
    signals: [
      { type: "inbound_call", hoursAgo: 9, detail: "asked about a hail inspection" },
      { type: "missed_call", hoursAgo: 8, detail: "call dropped before transfer" },
    ],
  },
  {
    input: {
      firstName: "Priya",
      lastName: "Raman",
      company: "Raman Residence",
      city: "Lakewood",
      phone: "+1 303-555-0133",
      email: "priya.raman@example.com",
      channelPreference: "sms",
      lostCallsPerMonth: 4,
      missedRevenuePerMonth: 8_400,
      tags: ["objection_price", "quote_sent"],
      notes: "Said the $2,497 was more than she expected. Has not said no.",
      createdAt: at(new Date().toISOString(), 24 * 95),
      pressureSpent: 0.2,
    },
    consents: [
      { purpose: "marketing", channel: "sms", source: "web form, 2026-08-16" },
      { purpose: "marketing", channel: "email", source: "web form, 2026-08-16" },
    ],
    signals: [
      { type: "form_fill", hoursAgo: 24 * 40, detail: "requested a quote" },
      { type: "inbound_call", hoursAgo: 30, detail: "walked through the quote" },
      { type: "reply_objection_price", hoursAgo: 26, detail: "more than expected" },
    ],
  },
  {
    input: {
      firstName: "Tom",
      lastName: "Becker",
      company: "Becker Residence",
      city: "Boulder",
      phone: "+1 303-555-0164",
      email: "tom.becker@example.com",
      channelPreference: "email",
      lostCallsPerMonth: 5,
      missedRevenuePerMonth: 12_900,
      tags: ["booked"],
      notes: "Inspection booked for next week. Needs a confirmation and a reminder.",
      createdAt: at(new Date().toISOString(), 24 * 310),
      pressureSpent: 0.3,
    },
    consents: [
      { purpose: "marketing", channel: "email", source: "inbound call, 2026-11-15" },
      { purpose: "transactional", channel: "email", source: "booking, 2026-11-17" },
      { purpose: "transactional", channel: "sms", source: "booking, 2026-11-17" },
    ],
    signals: [
      { type: "inbound_call", hoursAgo: 60 },
      { type: "booking", hoursAgo: 50, detail: "inspection, Tue 9:00" },
    ],
  },
  {
    input: {
      firstName: "Angela",
      lastName: "Cross",
      company: "Cross Residence",
      city: "Centennial",
      phone: "+1 303-555-0121",
      email: "angela.cross@example.com",
      channelPreference: "sms",
      lostCallsPerMonth: 2,
      missedRevenuePerMonth: 4_100,
      tags: ["job_complete", "review_candidate"],
      notes: "Roof and gutters completed five days ago. Happy, but has not reviewed.",
      createdAt: at(new Date().toISOString(), 24 * 420),
    },
    consents: [
      { purpose: "marketing", channel: "sms", source: "inbound call, 2026-06-02" },
      { purpose: "review", channel: "sms", source: "job completion, 2026-11-14" },
    ],
    signals: [
      { type: "job_completed", hoursAgo: 120, detail: "roof + gutters" },
    ],
  },
  {
    input: {
      firstName: "Derrick",
      lastName: "Shaw",
      company: "Shaw Residence",
      city: "Denver",
      phone: "+1 303-555-0192",
      email: "derrick.shaw@example.com",
      channelPreference: "email",
      lostCallsPerMonth: 9,
      missedRevenuePerMonth: 22_300,
      tags: ["dormant", "roof_2016"],
      notes: "Last job in 2016. Opens email occasionally, never replies.",
      createdAt: at(new Date().toISOString(), 24 * 1_400),
      pressureSpent: 1.1,
    },
    consents: [
      { purpose: "marketing", channel: "email", source: "past customer, 2016" },
    ],
    signals: [
      { type: "job_completed", hoursAgo: 24 * 1_100 },
      { type: "email_open", hoursAgo: 700 },
      { type: "no_response", hoursAgo: 400 },
    ],
  },
  {
    input: {
      firstName: "Nina",
      lastName: "Patel",
      company: "Patel Residence",
      city: "Arvada",
      phone: "+1 303-555-0170",
      email: "nina.patel@example.com",
      channelPreference: "sms",
      lostCallsPerMonth: 3,
      missedRevenuePerMonth: 6_800,
      tags: ["high_intent"],
      notes: "Filled the storm-damage form twice in one day.",
      createdAt: at(new Date().toISOString(), 24 * 12),
    },
    consents: [
      { purpose: "marketing", channel: "sms", source: "web form, 2026-11-19" },
      { purpose: "marketing", channel: "email", source: "web form, 2026-11-19" },
    ],
    signals: [
      { type: "form_fill", hoursAgo: 7, detail: "storm damage form" },
      { type: "link_click", hoursAgo: 6, detail: "pricing page" },
    ],
  },
  {
    input: {
      firstName: "Wes",
      lastName: "Tucker",
      company: "Tucker Residence",
      city: "Golden",
      phone: "+1 303-555-0155",
      email: "wes.tucker@example.com",
      channelPreference: "email",
      lostCallsPerMonth: 6,
      missedRevenuePerMonth: 15_200,
      tags: ["objection_trust"],
      notes: "Asked whether the AI actually answers the phone or just texts.",
      createdAt: at(new Date().toISOString(), 24 * 60),
      pressureSpent: 0.5,
    },
    consents: [
      { purpose: "marketing", channel: "email", source: "inbound call, 2026-11-12" },
      { purpose: "marketing", channel: "voice", source: "inbound call, 2026-11-12" },
    ],
    signals: [
      { type: "inbound_call", hoursAgo: 26 },
      { type: "reply_objection_trust", hoursAgo: 20, detail: "does the AI actually answer?" },
    ],
  },
  {
    input: {
      firstName: "Carmen",
      lastName: "Ruiz",
      company: "Ruiz Residence",
      city: "Thornton",
      phone: "+1 303-555-0148",
      email: "carmen.ruiz@example.com",
      channelPreference: "sms",
      lostCallsPerMonth: 4,
      missedRevenuePerMonth: 9_600,
      tags: ["not_now"],
      notes: "Said to check back after the holidays.",
      createdAt: at(new Date().toISOString(), 24 * 180),
      pressureSpent: 0.9,
    },
    consents: [
      { purpose: "marketing", channel: "sms", source: "inbound call, 2026-05-20" },
    ],
    signals: [
      { type: "reply_not_now", hoursAgo: 48, detail: "after the holidays" },
      { type: "reply_positive", hoursAgo: 49 },
    ],
  },
  {
    input: {
      firstName: "Owen",
      lastName: "Blake",
      company: "Blake Residence",
      city: "Littleton",
      phone: "+1 303-555-0166",
      email: "owen.blake@example.com",
      channelPreference: "voice",
      lostCallsPerMonth: 8,
      missedRevenuePerMonth: 18_700,
      tags: ["human_handoff", "insurance_claim"],
      notes: "Insurance claim. Wants a person, not an assistant.",
      createdAt: at(new Date().toISOString(), 24 * 36),
    },
    consents: [
      { purpose: "marketing", channel: "voice", source: "inbound call, 2026-11-18" },
      { purpose: "support", channel: "voice", source: "inbound call, 2026-11-18" },
    ],
    signals: [
      { type: "inbound_call", hoursAgo: 7, detail: "insurance claim question" },
      { type: "human_handoff", hoursAgo: 5, detail: "asked for the owner" },
    ],
  },
  {
    input: {
      firstName: "Hana",
      lastName: "Kim",
      company: "Kim Residence",
      city: "Westminster",
      phone: "+1 303-555-0139",
      email: "hana.kim@example.com",
      channelPreference: "email",
      lostCallsPerMonth: 2,
      missedRevenuePerMonth: 3_200,
      tags: ["complaint", "at_risk"],
      notes: "Crew left debris in the driveway. Legitimate complaint.",
      createdAt: at(new Date().toISOString(), 24 * 500),
      pressureSpent: 1.6,
    },
    consents: [
      { purpose: "marketing", channel: "email", source: "past customer, 2025" },
      { purpose: "support", channel: "email", source: "support thread, 2026-11-19" },
    ],
    signals: [
      { type: "job_completed", hoursAgo: 24 * 300 },
      { type: "complaint", hoursAgo: 3, detail: "debris left in driveway" },
    ],
  },
  {
    input: {
      firstName: "Franny",
      lastName: "Ellis",
      company: "Ellis Residence",
      city: "Englewood",
      phone: "+1 303-555-0181",
      email: "franny.ellis@example.com",
      channelPreference: "sms",
      lostCallsPerMonth: 5,
      missedRevenuePerMonth: 11_500,
      tags: ["seasonal", "roof_2021"],
      notes: "Roof is four years old. First hard freeze is coming.",
      createdAt: at(new Date().toISOString(), 24 * 600),
    },
    consents: [
      { purpose: "marketing", channel: "sms", source: "past customer, 2023" },
    ],
    signals: [
      { type: "job_completed", hoursAgo: 24 * 520 },
      { type: "seasonal_event", hoursAgo: 12, detail: "hard freeze forecast in 72h" },
    ],
  },
  {
    input: {
      firstName: "Maya",
      lastName: "Chen",
      company: "Chen Residence",
      city: "Broomfield",
      phone: "+1 303-555-0127",
      email: "maya.chen@example.com",
      channelPreference: "sms",
      lostCallsPerMonth: 1,
      missedRevenuePerMonth: 2_900,
      tags: ["job_complete", "do_not_ask"],
      notes: "Asked not to be contacted for a review after a billing dispute.",
      createdAt: at(new Date().toISOString(), 24 * 260),
      doNotAskReview: true,
    },
    consents: [
      { purpose: "marketing", channel: "sms", source: "inbound call, 2025-12-01" },
      { purpose: "review", channel: "sms", source: "job completion, 2026-11-10" },
    ],
    signals: [{ type: "job_completed", hoursAgo: 200, detail: "repair, billing dispute resolved" }],
  },
  {
    input: {
      firstName: "Sal",
      lastName: "Romero",
      company: "Romero Residence",
      city: "Commerce City",
      phone: "+1 303-555-0104",
      email: "sal.romero@example.com",
      channelPreference: "voice",
      lostCallsPerMonth: 6,
      missedRevenuePerMonth: 13_400,
      tags: ["vulnerable", "storm_damage"],
      notes: "Recent house fire. Flagged vulnerable; only a human may continue.",
      vulnerable: true,
      createdAt: at(new Date().toISOString(), 24 * 20),
    },
    consents: [
      { purpose: "marketing", channel: "voice", source: "inbound call, 2026-11-18" },
    ],
    signals: [
      { type: "inbound_call", hoursAgo: 22, detail: "storm and fire damage" },
      { type: "missed_call", hoursAgo: 8 },
    ],
  },
  {
    input: {
      firstName: "Rob",
      lastName: "Delgado",
      company: "Delgado Residence",
      city: "Parker",
      phone: "+1 303-555-0159",
      email: "rob.delgado@example.com",
      channelPreference: "sms",
      lostCallsPerMonth: 3,
      missedRevenuePerMonth: 5_400,
      tags: ["opted_out"],
      notes: "Replied STOP in September. Do not contact.",
      createdAt: at(new Date().toISOString(), 24 * 900),
    },
    consents: [{ purpose: "marketing", channel: "sms", source: "past customer, 2024" }],
    signals: [{ type: "job_completed", hoursAgo: 24 * 880 }],
    optOut: { hoursAgo: 24 * 60, reason: "replied STOP" },
  },
  {
    input: {
      firstName: "Ike",
      lastName: "Turner",
      company: "Turner Residence",
      city: "Castle Rock",
      phone: "+1 303-555-0111",
      email: "ike.turner@example.com",
      channelPreference: "sms",
      lostCallsPerMonth: 12,
      missedRevenuePerMonth: 26_800,
      tags: ["new", "no_consent"],
      notes: "Purchased a list. No consent on file — the OS should refuse to contact.",
      createdAt: at(new Date().toISOString(), 24 * 4),
    },
    consents: [],
    signals: [],
  },
];

export function seedDemo(store: KernelStore, now: string): void {
  if (store.contacts().length > 0) return;

  const createdAt = at(now, 24 * 1_000);
  store.configureTenant(
    {
      name: "Summit Ridge Roofing",
      trade: "roofing",
      city: "Denver",
      state: "CO",
      avgTicket: 14_500,
      ownerName: "Ray Salazar",
      ownerPhone: "+1 303-555-0142",
      proof: {
        name: "Alvarez Roofing",
        city: "Lakewood",
        result: "They booked 11 additional jobs in the first six weeks",
        action: "a 20-second Google profile check before every callback",
      },
      reviewLink: "https://g.page/r/summit-ridge-roofing/review",
    },
    createdAt,
  );

  const ops: Array<{ at: string; run: () => void }> = [];
  const ids = new Map<string, string>();

  SEED.forEach((seed, index) => {
    const created = store.createContact(
      { ...seed.input, createdAt: at(now, 24 * (900 - index * 25)) },
      at(now, 24 * (900 - index * 25)),
    );
    ids.set(`${seed.input.firstName} ${seed.input.lastName}`, created.id);
    const key = `${seed.input.firstName} ${seed.input.lastName}`;

    if (seed.input.tags?.length || seed.input.pressureSpent || seed.input.doNotAskReview) {
      ops.push({
        at: new Date(Date.parse(created.createdAt) + 60_000).toISOString(),
        run: () => {
          store.emit(
            "contact.updated",
            new Date(Date.parse(created.createdAt) + 60_000).toISOString(),
            {
              contactId: created.id,
              patch: {
                tags: seed.input.tags ?? [],
                pressureSpent: seed.input.pressureSpent ?? 0,
                doNotAskReview: seed.input.doNotAskReview ?? false,
              },
            },
            created.id,
            "seed",
          );
        },
      });
    }

    for (const consent of seed.consents) {
      const when = at(now, consent.hoursAgo ?? 24 * 90);
      ops.push({
        at: when,
        run: () => {
          const record: Consent = {
            purpose: consent.purpose,
            channel: consent.channel,
            granted: consent.granted ?? true,
            at: when,
            source: consent.source ?? "seed",
          };
          store.recordConsent(ids.get(key)!, record, when);
        },
      });
    }

    for (const signal of seed.signals) {
      const when = at(now, signal.hoursAgo);
      ops.push({
        at: when,
        run: () => {
          store.recordSignal(ids.get(key)!, signal.type, when, signal.source ?? "seed", signal.detail);
        },
      });
    }

    if (seed.optOut) {
      const when = at(now, seed.optOut.hoursAgo);
      ops.push({ at: when, run: () => store.optOut(ids.get(key)!, when, seed.optOut!.reason) });
    }
  });

  ops.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const op of ops) op.run();

  const tom = ids.get("Tom Becker");
  if (tom) store.createBooking(tom, "Tuesday, Nov 24 at 9:00 AM", 14_500, at(now, 50));
}
