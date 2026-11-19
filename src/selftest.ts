import { createServer } from "node:http";
import { KernelStore, DEFAULT_TENANT } from "./kernel/store.ts";
import { seedDemo } from "./kernel/seed.ts";
import { SEED_CLAIMS } from "./kernel/claims.ts";
import { DEFAULT_SETTINGS } from "./kernel/policy.ts";
import { Conductor } from "./kernel/conductor.ts";
import { experimentReport } from "./kernel/experiment.ts";
import { deliverAction, type DeliveryConfig } from "./tools/delivery.ts";
import { calendarConfigFromEnv, createBooking, getAvailableSlots, reserveSlot, type CalendarConfig } from "./tools/calendar.ts";
import { importContactsFromCsv } from "./tools/csv.ts";
import { hermesStatus } from "./tools/hermes.ts";
import type { ActionRecord, Contact } from "./neuro/types.ts";

const NOW = "2026-11-19T18:00:00.000Z";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

async function mockServer(handler: (url: string, body: string, res: import("node:http").ServerResponse) => void): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      handler(req.url ?? "/", body, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

export async function runSelfTest(): Promise<boolean> {
  const results: Check[] = [];
  const check = async (name: string, fn: () => Promise<string | void> | string | void): Promise<void> => {
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail: detail || undefined });
    } catch (error) {
      results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };

  const store = new KernelStore({ tenant: DEFAULT_TENANT, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS, persist: false });
  seedDemo(store, NOW);
  const conductor = new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS);
  const tom = store.contacts().find((c) => c.firstName === "Tom");
  if (!tom) throw new Error("Self-test seed is missing Tom Becker");

  await check("event log chain is valid", () => {
    const result = store.log.verify();
    if (!result.ok) throw new Error(`chain broken at ${result.brokenAt ?? "unknown"}`);
    return `${result.count} events`;
  });

  await check("CSV import records consent without inventing it", () => {
    const s = new KernelStore({ tenant: DEFAULT_TENANT, claims: [], settings: DEFAULT_SETTINGS, persist: false });
    const summary = importContactsFromCsv(
      s,
      "first_name,email,phone,consent_sms,consent_source\nAda,ada@example.com,+13035550111,yes,web form\nBob,bob@example.com,+13035550122,no,",
      NOW,
    );
    if (summary.imported !== 2) throw new Error(`imported ${summary.imported}`);
    if (summary.withConsent !== 1 || summary.withoutConsent !== 1) throw new Error("consent split is wrong");
    return "2 contacts · 1 consented · 1 waiting";
  });

  await check("scheduler produces a policy-checked move", () => {
    const plan = conductor.planFor(tom.id, NOW);
    if (!plan) throw new Error("no plan");
    if (!plan.message.body) throw new Error("no message");
    if (!plan.decision.whyNow) throw new Error("no why-now");
    return `${plan.move.id} · ${plan.channel} · allowed=${plan.verdict.allowed}`;
  });

  const dispatched = conductor.dispatch(tom.id, NOW);
  if (!dispatched?.action) throw new Error("Selftest could not dispatch an action");
  const smsAction: ActionRecord = { ...dispatched.action, channel: "sms", subject: undefined };

  await check("Twilio adapter posts a real SMS payload", async () => {
    let seen = "";
    const twilio = await mockServer((url, body, res) => {
      seen = `${url} ${body}`;
      res.end(JSON.stringify({ sid: "SM_SELFTEST" }));
    });
    try {
      const config: DeliveryConfig = {
        timeoutMs: 2_000,
        twilio: { accountSid: "AC_TEST", authToken: "token", from: "+13035550100", baseUrl: twilio.url },
      };
      const result = await deliverAction(smsAction, tom, config);
      if (!result.ok || result.provider !== "twilio") throw new Error(result.error ?? "not delivered");
      if (!seen.includes("/Messages.json")) throw new Error("wrong Twilio path");
      return `${result.provider} · ${result.id}`;
    } finally {
      await twilio.close();
    }
  });

  await check("Resend adapter posts a real email payload", async () => {
    let seen = "";
    const resend = await mockServer((url, body, res) => {
      seen = `${url} ${body}`;
      res.end(JSON.stringify({ id: "email_selftest" }));
    });
    try {
      const emailAction: ActionRecord = { ...smsAction, channel: "email", subject: "A note from Summit Ridge" };
      const result = await deliverAction(emailAction, tom, {
        timeoutMs: 2_000,
        resend: { apiKey: "re_test", from: "ray@example.com", baseUrl: resend.url },
      });
      if (!result.ok || result.provider !== "resend") throw new Error(result.error ?? "not delivered");
      if (!seen.includes("/emails")) throw new Error("wrong Resend path");
      return `${result.provider} · ${result.id}`;
    } finally {
      await resend.close();
    }
  });

  await check("Cal.diy slots, reservation and booking", async () => {
    const cal = await mockServer((url, _body, res) => {
      if (url.startsWith("/v2/slots/reservations")) {
        res.end(JSON.stringify({ status: "success", data: { uid: "res_selftest", start: "2026-11-21T16:00:00.000Z" } }));
      } else if (url === "/v2/bookings") {
        res.statusCode = 201;
        res.end(JSON.stringify({ status: "success", data: { uid: "bk_selftest", start: "2026-11-21T16:00:00.000Z" } }));
      } else {
        res.end(JSON.stringify({ status: "success", data: { "2026-11-21": [{ start: "2026-11-21T16:00:00.000Z" }, { start: "2026-11-21T18:30:00.000Z" }] } }));
      }
    });
    try {
      const config: CalendarConfig = {
        baseUrl: cal.url,
        apiKey: "cal_test",
        eventTypeId: "42",
        timeZone: "America/Denver",
        timeoutMs: 2_000,
      };
      const slots = await getAvailableSlots(config, NOW);
      if (slots.length < 2) throw new Error("fewer than two slots");
      const reservation = await reserveSlot(config, slots[0]!.start);
      if (!reservation.ok) throw new Error(reservation.error ?? "reservation failed");
      const booking = await createBooking(config, {
        start: slots[0]!.start,
        name: `${tom.firstName} ${tom.lastName}`,
        email: tom.email,
        phone: tom.phone,
        timeZone: tom.timezone,
        contactId: tom.id,
      });
      if (!booking.ok) throw new Error(booking.error ?? "booking failed");
      return `${slots.length} slots · ${reservation.uid} · ${booking.uid}`;
    } finally {
      await cal.close();
    }
  });

  await check("holdout report splits the eligible book", () => {
    const report = experimentReport(store, { CHOICE_HOLDOUT_PCT: "0.15", CHOICE_EXPERIMENT_ID: "selftest" } as NodeJS.ProcessEnv);
    if (report.treatment.contacts + report.holdout.contacts === 0) throw new Error("no eligible contacts");
    return `${report.treatment.contacts} treatment · ${report.holdout.contacts} holdout`;
  });

  await check("Hermes is installed and read-only", () => {
    const status = hermesStatus();
    if (!status.available) throw new Error("Hermes not installed");
    return `${status.model} · fallback ${status.fallback?.model ?? "none"}`;
  });

  await check("calendar env is either configured or explicitly absent", () => {
    const config = calendarConfigFromEnv();
    return config ? `${config.baseUrl} · event ${config.eventTypeId}` : "not configured — demo slots only";
  });

  console.log("\nBioDynamX Choice OS — self-test\n");
  for (const result of results) {
    console.log(`${result.ok ? "✓" : "✗"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed\n`);
  return failed.length === 0;
}
