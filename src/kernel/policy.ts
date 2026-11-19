import type {
  Channel,
  Claim,
  Contact,
  KernelSettings,
  Move,
  PolicyIssue,
  PolicyVerdict,
  Purpose,
} from "../neuro/types.ts";
import { extractNumbers, isStructuralNumber } from "./claims.ts";
import { readiness } from "../neuro/field.ts";

export const DEFAULT_SETTINGS: KernelSettings = {
  quietHours: { start: 8, end: 21, appliesTo: ["voice", "sms"] },
  frequency: { per24h: 1, per7d: 3, per30d: 8 },
  pressureBudget: 3,
  requireClaimForNumbers: true,
  requireAiDisclosure: true,
  reviewAudience: "all_completed",
  minReadinessForOutbound: 0.16,
  humanApprovalAbovePressure: 0.25,
};

export interface ActionInput {
  move: Move;
  channel: Channel;
  purpose: Purpose;
  body: string;
  claimIds: string[];
  initiatedBy: "system" | "human" | "inbound";
  isFirstContact?: boolean;
  realDeadline?: string;
  proofSegment?: string;
  reviewAudience?: "all_completed" | "promoters";
  allowedNumbers?: number[];
  roleAutonomy?: "full" | "draft_only" | "human_required";
}

export interface PolicyContext {
  contact: Contact;
  now: string;
  localHour: number;
  claims: Claim[];
  settings: KernelSettings;
  action: ActionInput;
  outbound: { h24: number; d7: number; d30: number };
}

const ABSOLUTE_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bguarantee(?:d|s)?\b/i, label: "guarantee" },
  { re: /\b100\s?%/i, label: "100%" },
  { re: /\brisk[- ]free\b/i, label: "risk-free" },
  { re: /\bnever miss\b/i, label: "never miss" },
  { re: /\b(?:instant|overnight)\s+(?:results?|bookings?|revenue|growth)\b/i, label: "instant results" },
  { re: /\bdouble your\b/i, label: "double your" },
  { re: /\btriple your\b/i, label: "triple your" },
  { re: /\bact now\b/i, label: "act now" },
  { re: /\blimited time\b/i, label: "limited time" },
  { re: /\bonly \d+ (?:spots?|slots?|left)\b/i, label: "false scarcity" },
  { re: /\bbefore it'?s too late\b/i, label: "before it's too late" },
];

const FAKE_DEADLINE =
  /\b(?:(?:offer|price|discount|quote|slot|hold)\s+expires?\b|expires?\s+(?:today|tonight|tomorrow|soon)\b|ends?\s+(?:today|tonight|tomorrow)\b|last chance\b|final notice\b|final call\b|spots? (?:are )?filling\b|before it'?s too late\b|only \d+ (?:spots?|slots?) left\b)/i;

const REVIEW_GATING = [
  /\bonly if (?:you'?re|you are) (?:happy|satisfied)\b/i,
  /\b5[- ]star\b/i,
  /\bpositive review\b/i,
  /\bif you (?:had|have) a good experience\b/i,
  /\bplease (?:leave|give) (?:us )?(?:a )?(?:good|great|5)\b/i,
];

const CONTROL_LANGUAGE = /\b(?:send|show|see|fix|start|reply|book|call|audit|plan|step|choose|hold|check|look)\b/i;

function issue(
  code: string,
  rule: string,
  severity: "block" | "warn",
  message: string,
  fix?: string,
): PolicyIssue {
  return { code, rule, severity, message, fix };
}

function hasConsent(contact: Contact, purpose: Purpose, channel: Channel, now: string): boolean {
  return contact.consent.some((c) => {
    if (!c.granted) return false;
    if (c.channel !== channel) return false;
    if (c.purpose !== purpose && !(c.purpose === "marketing" && purpose === "marketing")) return false;
    if (c.expiresAt && Date.parse(c.expiresAt) <= Date.parse(now)) return false;
    return true;
  });
}

function stripAllowedPhrases(body: string, phrases: string[]): string {
  let out = body;
  for (const phrase of phrases) {
    out = out.split(phrase).join(" ");
  }
  return out;
}

/**
 * The policy engine is the part of the OS that cannot be talked out of a rule
 * by a language model. It runs before generation (move legality) and after
 * generation (content lint), and every verdict is stored with the action.
 */
export function evaluatePolicy(ctx: PolicyContext): PolicyVerdict {
  const { contact, action, settings, now, localHour, outbound } = ctx;
  const issues: PolicyIssue[] = [];
  const marketing = action.purpose === "marketing";
  const outboundAction = action.initiatedBy === "system";

  // 1. Opt-out is absolute for everything except a transactional confirmation.
  if (contact.optedOut && action.purpose !== "transactional") {
    issues.push(
      issue(
        "opt_out",
        "Opt-out is honoured globally and immediately",
        "block",
        "Contact has opted out; no marketing, support or review contact is permitted.",
        "Suppress the contact and log the attempt.",
      ),
    );
  }

  // 2. Consent, per purpose and channel.
  if (marketing && !hasConsent(contact, "marketing", action.channel, now)) {
    issues.push(
      issue(
        "no_marketing_consent",
        "Marketing requires a channel-specific, unexpired consent record",
        "block",
        `No ${action.channel} marketing consent on file.`,
        "Capture consent with source and timestamp before sending.",
      ),
    );
  }
  if (action.purpose === "review" && !hasConsent(contact, "review", action.channel, now)) {
    issues.push(
      issue(
        "no_review_consent",
        "Review requests require review consent on the channel",
        "block",
        `No ${action.channel} review consent on file.`,
        "Ask for review permission at job completion, then send.",
      ),
    );
  }

  // 3. Quiet hours in the contact's own timezone.
  if (
    outboundAction &&
    settings.quietHours.appliesTo.includes(action.channel) &&
    (localHour < settings.quietHours.start || localHour >= settings.quietHours.end)
  ) {
    issues.push(
      issue(
        "quiet_hours",
        `No outbound ${action.channel} outside ${settings.quietHours.start}:00–${settings.quietHours.end}:00 local`,
        "block",
        `Local time is ${String(localHour).padStart(2, "0")}:00, outside the permitted window.`,
        "Queue for the next permitted window in the contact's timezone.",
      ),
    );
  }

  // 4. Frequency caps.
  if (marketing) {
    const f = settings.frequency;
    if (outbound.h24 >= f.per24h) {
      issues.push(
        issue("frequency_24h", "Maximum one marketing contact per 24 hours", "block", `${outbound.h24} already sent in 24h.`, "Wait."),
      );
    }
    if (outbound.d7 >= f.per7d) {
      issues.push(
        issue("frequency_7d", "Maximum three marketing contacts per 7 days", "block", `${outbound.d7} already sent in 7d.`, "Wait."),
      );
    }
    if (outbound.d30 >= f.per30d) {
      issues.push(
        issue("frequency_30d", "Maximum eight marketing contacts per 30 days", "block", `${outbound.d30} already sent in 30d.`, "Wait or close the loop."),
      );
    }
  }

  // 5. Pressure budget — the ethical core.
  const nextPressure = contact.pressureSpent + action.move.pressure;
  if (nextPressure > contact.pressureBudget + 1e-9) {
    issues.push(
      issue(
        "pressure_budget",
        "Each contact has a finite pressure budget",
        "block",
        `This move would spend ${nextPressure.toFixed(2)} of a ${contact.pressureBudget.toFixed(2)} budget.`,
        "Use a zero-pressure move or wait.",
      ),
    );
  }

  // 6. Vulnerable contacts get humans, not automation.
  if (contact.vulnerable && action.move.pressure > 0.05 && action.initiatedBy !== "human") {
    issues.push(
      issue(
        "vulnerable_contact",
        "Vulnerable contacts are never exposed to automated pressure",
        "block",
        "Contact is flagged vulnerable; only a human may continue.",
        "Escalate to a human and record the handoff.",
      ),
    );
  }

  // 7. Claim requirements.
  if (action.move.requires?.claim) {
    if (action.claimIds.length === 0) {
      issues.push(
        issue("claim_required", "Outcome or loss statements require a verified claim", "block", "No claim attached to this move.", "Attach a claim from the registry."),
      );
    }
    for (const id of action.claimIds) {
      const found = ctx.claims.find((c) => c.id === id);
      if (!found) {
        issues.push(issue("claim_missing", "Every attached claim must exist", "block", `Claim ${id} not found.`));
        continue;
      }
      if (Date.parse(found.expiresAt) <= Date.parse(now)) {
        issues.push(issue("claim_expired", "Expired claims may not be used", "block", `Claim ${id} expired.`, "Re-verify the claim."));
      }
      if (found.segment && found.segment !== "*" && found.segment !== contact.trade) {
        issues.push(issue("claim_segment", "Claims are segment-scoped", "block", `Claim ${id} is for ${found.segment}, contact is ${contact.trade}.`));
      }
    }
  }

  if (action.move.requires?.sameSegmentProof) {
    const hasProof = action.proofSegment === contact.trade || action.claimIds.some((id) => ctx.claims.find((c) => c.id === id)?.segment === contact.trade);
    if (!hasProof) {
      issues.push(
        issue("proof_required", "Local proof must be from the same trade", "block", "No same-trade proof attached.", "Attach a same-trade case study or remove the move."),
      );
    }
  }

  if (action.move.requires?.realDeadline) {
    if (!action.realDeadline || Date.parse(action.realDeadline) <= Date.parse(now)) {
      issues.push(
        issue("unreal_deadline", "Scarcity must map to a real, future event", "block", "No real deadline attached to a slot-holding move.", "Attach the actual calendar hold."),
      );
    }
  }

  // 8. No threat without a door.
  if (action.move.id === "name_real_loss") {
    if (contact.field.safety < 0.35) {
      issues.push(
        issue("loss_without_safety", "Loss framing is banned when safety is below 0.35", "block", `Safety is ${contact.field.safety.toFixed(2)}.`, "Rebuild safety first."),
      );
    }
    if (!CONTROL_LANGUAGE.test(action.body)) {
      issues.push(
        issue("loss_without_control", "Loss framing must include a concrete control step", "block", "The message names a loss but offers no way to act on it.", "Add the next step in the same message."),
      );
    }
  }

  // 9. Fake urgency.
  if (FAKE_DEADLINE.test(action.body) && !action.realDeadline) {
    issues.push(
      issue("manufactured_urgency", "Urgency may only come from a real event", "block", "The message uses urgency language with no real deadline.", "Remove the urgency or attach the real event."),
    );
  }

  // 10. Review gating.
  if (action.purpose === "review") {
    if ((action.reviewAudience ?? settings.reviewAudience) !== "all_completed") {
      issues.push(
        issue("review_gating", "Review requests go to every completed job", "block", "Audience is filtered to promoters.", "Send to all completed jobs."),
      );
    }
    if (contact.doNotAskReview) {
      issues.push(issue("review_opt_out", "A do-not-ask flag is absolute", "block", "Contact asked not to be asked for a review."));
    }
    for (const re of REVIEW_GATING) {
      if (re.test(action.body)) {
        issues.push(
          issue("review_gating_language", "No review gating, incentives or star instructions", "block", `Message matches gating pattern ${re}.`, "Ask for an honest review in neutral language."),
        );
      }
    }
  }

  // 11. AI disclosure on the first voice turn.
  if (settings.requireAiDisclosure && action.channel === "voice" && action.isFirstContact) {
    if (!/\b(?:ai|a\.i\.|automated|assistant)\b/i.test(action.body)) {
      issues.push(
        issue("ai_disclosure", "First voice turn must disclose that the caller is an AI", "block", "No AI disclosure found in the opening.", "Add a plain-language disclosure."),
      );
    }
  }

  // 12. Absolute-claim lint, minus phrases a claim explicitly authorises.
  const phrases = action.claimIds
    .map((id) => ctx.claims.find((c) => c.id === id)?.allowPhrases ?? [])
    .flat()
    .map((p) => p.toLowerCase());
  const lintBody = stripAllowedPhrases(action.body.toLowerCase(), phrases);
  for (const { re, label } of ABSOLUTE_PATTERNS) {
    if (re.test(lintBody)) {
      issues.push(
        issue("absolute_claim", "Absolute or guaranteed claims are banned", "block", `Message contains "${label}" without an authorising claim.`, "Rewrite as a specific, sourced, bounded statement."),
      );
    }
  }

  // 13. Numbers must be traceable.
  if (settings.requireClaimForNumbers) {
    const allowed = new Set<number>(action.allowedNumbers ?? []);
    for (const id of action.claimIds) {
      const claim = ctx.claims.find((c) => c.id === id);
      if (!claim) continue;
      for (const value of Object.values(claim.values)) {
        if (typeof value === "number") allowed.add(value);
        if (typeof value === "string") for (const n of extractNumbers(value)) allowed.add(n);
      }
      for (const n of extractNumbers(claim.text)) allowed.add(n);
    }
    const untraceable = extractNumbers(action.body).filter((n) => !isStructuralNumber(n) && !allowed.has(n));
    if (untraceable.length > 0) {
      issues.push(
        issue(
          "untraceable_number",
          "Currency, percentages and large numbers must trace to a claim",
          "block",
          `Untraceable values: ${[...new Set(untraceable)].join(", ")}.`,
          "Attach the claim or remove the number.",
        ),
      );
    }
  }

  // 14. Readiness floor for system-initiated marketing.
  if (outboundAction && marketing && readiness(contact.field) < settings.minReadinessForOutbound) {
    issues.push(
      issue(
        "low_readiness",
        "Do not initiate marketing below the readiness floor",
        "warn",
        `Readiness is ${(readiness(contact.field) * 100).toFixed(0)}%.`,
        "Prefer an inbound response or wait for a signal.",
      ),
    );
  }

  // 15. Human approval for high-pressure moves and draft-only roles.
  if (action.move.pressure >= settings.humanApprovalAbovePressure && action.initiatedBy === "system") {
    issues.push(
      issue(
        "human_approval",
        "High-pressure moves require human approval",
        "warn",
        `Pressure ${action.move.pressure.toFixed(2)} crosses the approval threshold.`,
        "Queue for human approval.",
      ),
    );
  }
  if (action.roleAutonomy === "draft_only" && outboundAction) {
    issues.push(
      issue("draft_only", "This role drafts; a human sends", "warn", "Role autonomy is draft-only.", "Approve in the console before dispatch."),
    );
  }

  return {
    allowed: !issues.some((i) => i.severity === "block"),
    issues,
    checkedAt: now,
  };
}

export function hasBlockingIssue(verdict: PolicyVerdict): boolean {
  return verdict.issues.some((i) => i.severity === "block");
}

export function policySummary(verdict: PolicyVerdict): string {
  if (verdict.allowed) {
    return verdict.issues.length === 0 ? "All rails clear" : `Clear with ${verdict.issues.length} warning(s)`;
  }
  return verdict.issues.filter((i) => i.severity === "block").map((i) => i.rule).join("; ");
}
