import type { Channel, Consent, Purpose } from "../neuro/types.ts";
import type { KernelStore } from "../kernel/store.ts";
import { parseCsv } from "./types.ts";

export interface CsvImportSummary {
  imported: number;
  skippedExisting: number;
  skippedNoContact: number;
  withConsent: number;
  withoutConsent: number;
  contacts: string[];
}

const ALIASES: Record<string, string[]> = {
  firstName: ["first_name", "firstname", "first"],
  lastName: ["last_name", "lastname", "last"],
  email: ["email", "email_address", "e_mail"],
  phone: ["phone", "mobile", "phone_number", "cell"],
  company: ["company", "company_name", "business", "account"],
  city: ["city", "town", "locality"],
  state: ["state", "province", "region"],
  trade: ["trade", "industry", "vertical", "sector"],
  ticket: ["ticket", "average_ticket", "job_value", "avg_ticket"],
  notes: ["notes", "personalization", "note"],
  consentSms: ["consent_sms", "sms_consent", "consent_text", "text_consent"],
  consentEmail: ["consent_email", "email_consent"],
  consentVoice: ["consent_voice", "voice_consent", "call_consent"],
  consentSource: ["consent_source", "source", "consent_from"],
  lastService: ["last_service", "last_service_date", "last_job", "last_job_date"],
};

function truthy(value: string): boolean {
  return /^(?:1|true|yes|y|granted|opt.?in|subscribed)$/i.test(value.trim());
}

function pick(row: string[], header: string[], key: keyof typeof ALIASES): string {
  for (const alias of ALIASES[key]) {
    const idx = header.indexOf(alias);
    if (idx >= 0) return (row[idx] ?? "").trim();
  }
  return "";
}

/**
 * Import a real customer list without inventing consent.
 *
 * A row with no consent is imported with a zero pressure budget and `needs_consent`; the
 * scheduler will wait. A row with a truthy consent column gets a consent record with the
 * source and timestamp, and becomes eligible for that channel.
 */
export function importContactsFromCsv(
  store: KernelStore,
  text: string,
  now: string,
): CsvImportSummary {
  const rows = parseCsv(text);
  const summary: CsvImportSummary = {
    imported: 0,
    skippedExisting: 0,
    skippedNoContact: 0,
    withConsent: 0,
    withoutConsent: 0,
    contacts: [],
  };
  if (rows.length < 2) return summary;

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const existingEmail = new Set(store.contacts().map((c) => c.email.toLowerCase()).filter(Boolean));
  const existingPhone = new Set(store.contacts().map((c) => c.phone.replace(/\D/g, "")).filter(Boolean));

  for (const row of rows.slice(1)) {
    const email = pick(row, header, "email").toLowerCase();
    const phone = pick(row, header, "phone");
    const phoneDigits = phone.replace(/\D/g, "");
    if (!email && !phoneDigits) {
      summary.skippedNoContact++;
      continue;
    }
    if ((email && existingEmail.has(email)) || (phoneDigits && existingPhone.has(phoneDigits))) {
      summary.skippedExisting++;
      continue;
    }

    const consentSource = pick(row, header, "consentSource") || "imported CSV";
    const consentFlags: Array<{ purpose: Purpose; channel: Channel; key: keyof typeof ALIASES }> = [
      { purpose: "marketing", channel: "sms", key: "consentSms" },
      { purpose: "marketing", channel: "email", key: "consentEmail" },
      { purpose: "marketing", channel: "voice", key: "consentVoice" },
    ];
    const granted = consentFlags.filter((c) => truthy(pick(row, header, c.key)));

    const ticket = Number(pick(row, header, "ticket").replace(/[^0-9.]/g, ""));
    const contact = store.createContact(
      {
        firstName: pick(row, header, "firstName") || "there",
        lastName: pick(row, header, "lastName"),
        company: pick(row, header, "company") || "Unknown company",
        trade: pick(row, header, "trade") || store.state.tenant.trade,
        city: pick(row, header, "city") || store.state.tenant.city,
        state: pick(row, header, "state") || store.state.tenant.state,
        phone,
        email,
        channelPreference: email ? "email" : "sms",
        estimatedTicket: Number.isFinite(ticket) && ticket > 0 ? ticket : undefined,
        tags: ["imported", granted.length > 0 ? "consented" : "needs_consent"],
        notes: [pick(row, header, "notes"), pick(row, header, "lastService") ? `Last service: ${pick(row, header, "lastService")}` : ""]
          .filter(Boolean)
          .join("\n"),
        pressureBudget: granted.length > 0 ? 3 : 0,
      },
      now,
    );

    for (const flag of granted) {
      const consent: Consent = {
        purpose: flag.purpose,
        channel: flag.channel,
        granted: true,
        at: now,
        source: consentSource,
      };
      store.recordConsent(contact.id, consent, now);
    }

    existingEmail.add(email);
    if (phoneDigits) existingPhone.add(phoneDigits);
    summary.imported++;
    if (granted.length > 0) summary.withConsent++;
    else summary.withoutConsent++;
    if (summary.contacts.length < 20) summary.contacts.push(contact.id);
  }

  return summary;
}
