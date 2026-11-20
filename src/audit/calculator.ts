export interface AuditInput {
  trade: string;
  missedCallsPerWeek: number;
  averageTicket: number;
  listSize: number;
}

export interface AuditResult {
  annualAtStake: number;
  monthlyAtStake: number;
  jobsAtStake: number;
  closeRate: number;
  assumptions: string[];
}

/**
 * Simple, honest math. It does not promise recovery; it shows the size of the leak.
 *
 * annual at stake = missed calls/week × 52 × close rate × average ticket
 */
export function calculateAudit(input: AuditInput): AuditResult {
  const calls = Math.max(0, Math.min(500, Math.round(input.missedCallsPerWeek || 0)));
  const ticket = Math.max(0, Math.min(1_000_000, Math.round(input.averageTicket || 0)));
  const closeRate = 0.2;
  const jobsAtStake = calls * 52 * closeRate;
  const annualAtStake = Math.round(jobsAtStake * ticket);
  return {
    annualAtStake,
    monthlyAtStake: Math.round(annualAtStake / 12),
    jobsAtStake: Math.round(jobsAtStake),
    closeRate,
    assumptions: [
      "20% of missed calls would have become a booked job.",
      "Average ticket is the customer's own number, not an industry average.",
      "This is the size of the leak, not a promise of recovery.",
    ],
  };
}

export function auditText(input: AuditInput, result: AuditResult): string {
  return [
    `Your ${input.trade} revenue leak`,
    "",
    `Missed calls per week: ${input.missedCallsPerWeek}`,
    `Average ticket: $${input.averageTicket.toLocaleString()}`,
    `Jobs at stake per year: ~${result.jobsAtStake}`,
    `Annual revenue at stake: $${result.annualAtStake.toLocaleString()}`,
    `Monthly at stake: $${result.monthlyAtStake.toLocaleString()}`,
    "",
    "Assumptions:",
    ...result.assumptions.map((a) => `- ${a}`),
    "",
    "The pilot works the calls and past customers you already have, with consent, quiet hours and a holdout. If it does not produce three booked jobs or $10,000 in 30 days, the next month is free.",
  ].join("\n");
}
