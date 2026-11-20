/**
 * Industry presets are defaults, not claims.
 *
 * A preset sets the trade name, average ticket and expected missed-call volume. It does not
 * invent a license, a review, a case study or a result. The tenant still has to supply its
 * own claim registry.
 */
export interface IndustryPreset {
  id: string;
  label: string;
  trade: string;
  avgTicket: number;
  missedCallsPerMonth: number;
  season: string;
  pitch: string;
}

export const INDUSTRIES: Record<string, IndustryPreset> = {
  roofing: {
    id: "roofing",
    label: "Roofing",
    trade: "roofing",
    avgTicket: 14_500,
    missedCallsPerMonth: 18,
    season: "hail and storm season",
    pitch: "Every missed call is a homeowner who called the next roofer.",
  },
  hvac: {
    id: "hvac",
    label: "HVAC",
    trade: "HVAC",
    avgTicket: 9_500,
    missedCallsPerMonth: 22,
    season: "first heat wave and first cold snap",
    pitch: "A missed AC call in July is a replacement that went to the next company.",
  },
  plumbing: {
    id: "plumbing",
    label: "Plumbing",
    trade: "plumbing",
    avgTicket: 1_200,
    missedCallsPerMonth: 25,
    season: "freeze season and holiday emergencies",
    pitch: "The emergency caller does not leave a voicemail. They call the next plumber.",
  },
  electrical: {
    id: "electrical",
    label: "Electrical",
    trade: "electrical",
    avgTicket: 2_500,
    missedCallsPerMonth: 15,
    season: "panel upgrades and EV charger demand",
    pitch: "A missed estimate is a panel upgrade that went to the next licensed electrician.",
  },
  restoration: {
    id: "restoration",
    label: "Restoration",
    trade: "restoration",
    avgTicket: 22_000,
    missedCallsPerMonth: 12,
    season: "storm and freeze events",
    pitch: "A water loss that waits an hour becomes a mold job — or a competitor's job.",
  },
  pest: {
    id: "pest",
    label: "Pest control",
    trade: "pest control",
    avgTicket: 450,
    missedCallsPerMonth: 20,
    season: "spring and summer",
    pitch: "A missed call is a recurring plan that never starts.",
  },
  landscaping: {
    id: "landscaping",
    label: "Landscaping",
    trade: "landscaping",
    avgTicket: 3_500,
    missedCallsPerMonth: 10,
    season: "spring installs",
    pitch: "A missed spring call is a full season of maintenance that went elsewhere.",
  },
  solar: {
    id: "solar",
    label: "Solar",
    trade: "solar",
    avgTicket: 18_000,
    missedCallsPerMonth: 8,
    season: "utility rate increases",
    pitch: "A missed solar call is a financed project that went to the next installer.",
  },
  painting: {
    id: "painting",
    label: "Painting",
    trade: "painting",
    avgTicket: 4_500,
    missedCallsPerMonth: 8,
    season: "spring and fall",
    pitch: "A missed estimate is a whole-house repaint that went to the next crew.",
  },
  garage: {
    id: "garage",
    label: "Garage doors",
    trade: "garage doors",
    avgTicket: 2_500,
    missedCallsPerMonth: 12,
    season: "spring and winter",
    pitch: "A broken spring is an emergency. A missed call is a same-day job lost.",
  },
};

export function industryPreset(id: string): IndustryPreset | undefined {
  return INDUSTRIES[id.toLowerCase()];
}

export function industryList(): IndustryPreset[] {
  return Object.values(INDUSTRIES);
}
