import { createHash } from "node:crypto";
import type { KernelStore } from "./store.ts";

export type Arm = "treatment" | "holdout";

/**
 * A deterministic holdout, not a random one.
 *
 * The same contact always lands in the same arm for a given experiment. That makes the
 * report reproducible and prevents a contact from drifting between arms when the process
 * restarts. The hash is over experiment id + contact id, so changing the experiment resets
 * the split cleanly.
 */
export function armFor(contactId: string, percent: number, experiment = "pilot-01"): Arm {
  const pct = Math.max(0, Math.min(1, percent));
  if (pct <= 0) return "treatment";
  if (pct >= 1) return "holdout";
  const digest = createHash("sha256").update(`${experiment}:${contactId}`).digest();
  const bucket = digest.readUInt32BE(0) / 0x1_0000_0000;
  return bucket < pct ? "holdout" : "treatment";
}

export function holdoutPercent(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.CHOICE_HOLDOUT_PCT ?? 0);
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
}

export function experimentId(env: NodeJS.ProcessEnv = process.env): string {
  return env.CHOICE_EXPERIMENT_ID ?? "pilot-01";
}

export interface ArmReport {
  contacts: number;
  actions: number;
  bookings: number;
  revenue: number;
  optOuts: number;
  bookingRate: number;
  optOutRate: number;
}

export interface ExperimentReport {
  id: string;
  holdoutPercent: number;
  startedAt: string | null;
  treatment: ArmReport;
  holdout: ArmReport;
  absoluteBookingLift: number | null;
  relativeBookingLift: number | null;
}

/**
 * Compare the treated book to the holdout. The report never claims causality beyond the
 * assignment; it reports booked jobs, revenue, messages and opt-outs by arm.
 */
export function experimentReport(store: KernelStore, env: NodeJS.ProcessEnv = process.env): ExperimentReport {
  const percent = holdoutPercent(env);
  const id = experimentId(env);
  const startedAt = env.CHOICE_EXPERIMENT_START ?? null;
  const eligible = store.contacts().filter(
    (c) =>
      c.consent.some((x) => x.granted && x.purpose === "marketing") &&
      (!c.optedOut || (startedAt !== null && c.optedOutAt !== undefined && c.optedOutAt >= startedAt)),
  );
  const make = (): ArmReport => ({ contacts: 0, actions: 0, bookings: 0, revenue: 0, optOuts: 0, bookingRate: 0, optOutRate: 0 });

  const arms: Record<Arm, ArmReport> = { treatment: make(), holdout: make() };
  const bookingByContact = new Map<string, { count: number; value: number }>();
  for (const booking of store.state.bookings) {
    const current = bookingByContact.get(booking.contactId) ?? { count: 0, value: 0 };
    bookingByContact.set(booking.contactId, { count: current.count + 1, value: current.value + booking.value });
  }
  const actionByContact = new Map<string, number>();
  for (const action of store.state.actions) {
    actionByContact.set(action.contactId, (actionByContact.get(action.contactId) ?? 0) + 1);
  }

  for (const contact of eligible) {
    const arm = arms[armFor(contact.id, percent, id)];
    arm.contacts++;
    arm.actions += actionByContact.get(contact.id) ?? 0;
    const booked = bookingByContact.get(contact.id);
    if (booked) {
      arm.bookings += booked.count;
      arm.revenue += booked.value;
    }
    if (contact.optedOut) arm.optOuts++;
  }

  for (const arm of Object.values(arms)) {
    arm.bookingRate = arm.contacts ? arm.bookings / arm.contacts : 0;
    arm.optOutRate = arm.contacts ? arm.optOuts / arm.contacts : 0;
  }

  const absolute = arms.treatment.bookingRate - arms.holdout.bookingRate;
  const relative = arms.holdout.bookingRate > 0 ? absolute / arms.holdout.bookingRate : null;
  return {
    id,
    holdoutPercent: percent,
    startedAt,
    treatment: arms.treatment,
    holdout: arms.holdout,
    absoluteBookingLift: Number(absolute.toFixed(4)),
    relativeBookingLift: relative === null ? null : Number(relative.toFixed(4)),
  };
}
