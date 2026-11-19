import type { Claim } from "../neuro/types.ts";

/**
 * Claims registry.
 *
 * A number in a customer-facing message is a liability until it is traceable.
 * Every approved claim has a source, a verification date and an expiry. The
 * renderer may only use claim text; the policy engine blocks untraceable
 * currency, percentage and large-number statements.
 */
export class ClaimRegistry {
  private claims = new Map<string, Claim>();

  constructor(seed: Claim[] = []) {
    for (const claim of seed) this.add(claim);
  }

  add(claim: Claim): Claim {
    this.claims.set(claim.id, { ...claim });
    return claim;
  }

  get(id: string): Claim | undefined {
    return this.claims.get(id);
  }

  all(): Claim[] {
    return [...this.claims.values()];
  }

  /** A claim is usable only if it is unexpired and matches the segment. */
  validate(id: string, now: string, segment?: string): { ok: boolean; reason?: string; claim?: Claim } {
    const claim = this.claims.get(id);
    if (!claim) return { ok: false, reason: `claim ${id} does not exist` };
    if (Date.parse(claim.expiresAt) <= Date.parse(now)) {
      return { ok: false, reason: `claim ${id} expired ${claim.expiresAt}`, claim };
    }
    if (claim.segment && claim.segment !== "*" && segment && claim.segment !== segment) {
      return { ok: false, reason: `claim ${id} is for segment ${claim.segment}, not ${segment}`, claim };
    }
    return { ok: true, claim };
  }

  forSegment(segment?: string, now = new Date().toISOString()): Claim[] {
    return this.all().filter((c) => {
      if (Date.parse(c.expiresAt) <= Date.parse(now)) return false;
      return !c.segment || c.segment === "*" || c.segment === segment;
    });
  }

  numbers(ids: string[]): Set<number> {
    const out = new Set<number>();
    for (const id of ids) {
      const claim = this.claims.get(id);
      if (!claim) continue;
      for (const value of Object.values(claim.values)) {
        if (typeof value === "number") out.add(value);
        if (typeof value === "string") {
          for (const n of extractNumbers(value)) out.add(n);
        }
      }
      for (const n of extractNumbers(claim.text)) out.add(n);
    }
    return out;
  }

  phrases(ids: string[]): string[] {
    return ids.flatMap((id) => this.claims.get(id)?.allowPhrases ?? []).map((p) => p.toLowerCase());
  }
}

/** Currency, percentages and any integer of 100 or more. Years and times are excluded downstream. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  let rest = text;
  const money = text.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) ?? [];
  const pct = text.match(/\d[\d,]*(?:\.\d+)?\s?%/g) ?? [];
  for (const raw of [...money, ...pct]) {
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n)) out.push(n);
    rest = rest.split(raw).join(" ");
  }
  const big = rest.match(/\b\d{3,}(?:,\d{3})*(?:\.\d+)?\b/g) ?? [];
  for (const raw of big) {
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** Numbers that are structural rather than claims: years, clock times, phone numbers. */
export function isStructuralNumber(n: number): boolean {
  if (n >= 2000 && n <= 2035) return true; // year
  if (n <= 31) return true; // day of month, hour, "2 minutes", "24/7"
  return false;
}

export const SEED_CLAIMS: Claim[] = [
  {
    id: "claim_alvarez_case",
    text:
      "Alvarez Roofing in Lakewood booked 11 additional jobs in the first six weeks after adding a 20-second Google profile check before every callback.",
    values: { jobs: 11, weeks: 6, seconds: 20 },
    source: "Signed client case study, Alvarez Roofing, 2026-10-22",
    verifiedAt: "2026-10-22T00:00:00.000Z",
    expiresAt: "2027-10-22T00:00:00.000Z",
    segment: "roofing",
    allowPhrases: ["11 additional jobs"],
  },
  {
    id: "claim_recovery_5x",
    text:
      "The engagement is designed for a 5x return on the monthly fee; if a client does not reach 5x in the first 90 days, BioDynamX continues at no additional fee until the measured return reaches that level.",
    values: { multiple: 5, window_days: 90 },
    source: "BioDynamX master services agreement, §4.2 (2026-01)",
    verifiedAt: "2026-01-15T00:00:00.000Z",
    expiresAt: "2027-01-15T00:00:00.000Z",
    segment: "*",
    allowPhrases: ["5x", "five times"],
  },
  {
    id: "claim_missed_call_value",
    text:
      "For a roofing company, a missed call is not a missed conversation; it is a job that goes to the next contractor on the list.",
    values: { close_rate: 0.2 },
    source: "BioDynamX operating dataset, 2026 Q1–Q3",
    verifiedAt: "2026-10-01T00:00:00.000Z",
    expiresAt: "2027-04-01T00:00:00.000Z",
    segment: "roofing",
  },
  {
    id: "claim_speed_to_lead",
    text:
      "Replying within five minutes makes a lead dramatically more likely to convert than replying after an hour.",
    values: { window_minutes: 5 },
    source: "Lead-response meta-analysis, 2026",
    verifiedAt: "2026-02-01T00:00:00.000Z",
    expiresAt: "2027-02-01T00:00:00.000Z",
    segment: "*",
  },
  {
    id: "claim_hvac_season",
    text:
      "In Colorado, the first hard freeze produces a measurable spike in no-heat calls within 72 hours.",
    values: { window_hours: 72 },
    source: "NOAA Denver climate normals + BioDynamX call data, 2024–2026",
    verifiedAt: "2026-09-15T00:00:00.000Z",
    expiresAt: "2027-03-15T00:00:00.000Z",
    segment: "hvac",
  },
];
