import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KernelStore } from "../kernel/store.ts";
import { seedDemo } from "../kernel/seed.ts";
import { SEED_CLAIMS } from "../kernel/claims.ts";
import { DEFAULT_SETTINGS } from "../kernel/policy.ts";
import { Conductor } from "../kernel/conductor.ts";
import { experimentReport } from "../kernel/experiment.ts";
import { runSimulation } from "../sim/engine.ts";
import { ROLES, VOICE_SKINS } from "../roles/registry.ts";
import { MOVES } from "../neuro/moves.ts";
import { DIMENSIONS, DIMENSION_META } from "../neuro/types.ts";
import { llmConfigFromEnv, rewriteMessage } from "../llm/gateway.ts";
import { deliverAction, deliveryChannels, deliveryConfigFromEnv } from "../tools/delivery.ts";
import { askHermes, hermesStatus, type OpsSnapshot } from "../tools/hermes.ts";
import { calendarConfigFromEnv, getAvailableSlots, slotFacts, type CalendarConfig, type SlotFacts } from "../tools/calendar.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const PUBLIC = join(ROOT, "public");
const DATA = join(ROOT, "data");
const CALENDAR = calendarConfigFromEnv();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

export interface ServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
  store: KernelStore;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readRawBody(req);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function xmlEscape(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

function twilioSignature(url: string, params: URLSearchParams, authToken: string): string {
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  let data = url;
  for (const [key, value] of sorted) data += key + value;
  return createHmac("sha1", authToken).update(data).digest("base64");
}

function safePath(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const full = join(PUBLIC, normalized === "/" ? "index.html" : normalized);
  return full.startsWith(PUBLIC) ? full : null;
}

export async function startServer(options: { port?: number; dataDir?: string; host?: string } = {}): Promise<ServerHandle> {
  const store = new KernelStore({
    dataDir: options.dataDir ?? DATA,
    claims: SEED_CLAIMS,
    settings: DEFAULT_SETTINGS,
  });

  if (store.contacts().length === 0) {
    const now = new Date().toISOString();
    seedDemo(store, now);
  }

  const conductor = new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS);
  const startedAt = Date.now();
  let lastSim: unknown = null;
  let calendarCache: { at: number; facts: SlotFacts | null } | null = null;

  async function currentCalendarFacts(): Promise<SlotFacts | undefined> {
    if (!CALENDAR) return undefined;
    if (calendarCache && Date.now() - calendarCache.at < 300_000) return calendarCache.facts ?? undefined;
    try {
      const facts = await slotFacts(CALENDAR, new Date().toISOString());
      calendarCache = { at: Date.now(), facts };
      return facts ?? undefined;
    } catch {
      calendarCache = { at: Date.now(), facts: null };
      return undefined;
    }
  }

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    const authUser = process.env.CHOICE_CONSOLE_USER;
    const authPass = process.env.CHOICE_CONSOLE_PASS;
    if (authUser && authPass && path !== "/api/health" && !path.startsWith("/webhooks/")) {
      const expected = `Basic ${Buffer.from(`${authUser}:${authPass}`).toString("base64")}`;
      if (req.headers.authorization !== expected) {
        res.writeHead(401, { "www-authenticate": 'Basic realm="BioDynamX Choice OS"' });
        res.end("Authentication required");
        return;
      }
    }

    const needsCalendar =
      path === "/api/business" ||
      path.startsWith("/api/contacts/") ||
      path === "/api/tick" ||
      path === "/api/run-day";
    if (needsCalendar) conductor.setFacts(await currentCalendarFacts());

    try {
      if (method === "OPTIONS") {
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        res.end();
        return;
      }

      if (path === "/api/health") {
        send(res, 200, {
          ok: true,
          service: "bio2026-choice-os",
          version: "1.0.0",
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          events: store.log.events.length,
          chain: store.log.verify(),
          llm: Boolean(llmConfigFromEnv()),
          delivery: Boolean(deliveryConfigFromEnv().url),
        });
        return;
      }

      if (path === "/api/state") {
        const now = new Date().toISOString();
        const contacts = store.portfolio(now);
        send(res, 200, {
          now,
          tenant: store.state.tenant,
          metrics: store.metrics(now),
          contacts,
          roles: Object.values(ROLES),
          skins: Object.values(VOICE_SKINS),
          policy: store.settings,
          dimensions: DIMENSIONS.map((d) => ({ id: d, ...DIMENSION_META[d] })),
          claims: SEED_CLAIMS.map((c) => ({ id: c.id, text: c.text, segment: c.segment, expiresAt: c.expiresAt })),
          moves: Object.values(MOVES).map((m) => ({ id: m.id, label: m.label, pressure: m.pressure, system: m.system, intent: m.intent })),
          llm: Boolean(llmConfigFromEnv()),
          delivery: Boolean(deliveryConfigFromEnv().url),
        });
        return;
      }

      if (path === "/api/contacts") {
        const now = new Date().toISOString();
        send(res, 200, store.portfolio(now));
        return;
      }

      const contactMatch = path.match(/^\/api\/contacts\/([^/]+)$/);
      if (contactMatch && method === "GET") {
        const now = new Date().toISOString();
        const detail = store.hydrateContact(contactMatch[1], now);
        if (!detail) {
          send(res, 404, { error: "contact not found" });
          return;
        }
        send(res, 200, {
          contact: detail,
          actions: store.state.actions.filter((a) => a.contactId === contactMatch[1]).slice(-8).reverse(),
          decisions: store.state.decisions.filter((d) => d.contactId === contactMatch[1]).slice(-8).reverse(),
          replies: store.state.replies.filter((r) => r.contactId === contactMatch[1]).slice(-8).reverse(),
          bookings: store.state.bookings.filter((b) => b.contactId === contactMatch[1]),
        });
        return;
      }

      const planMatch = path.match(/^\/api\/contacts\/([^/]+)\/plan$/);
      if (planMatch && method === "GET") {
        const now = new Date().toISOString();
        const channel = (url.searchParams.get("channel") as "sms" | "email" | "voice" | "web" | null) ?? undefined;
        const result = conductor.planFor(planMatch[1], now, { channel });
        if (!result) {
          send(res, 404, { error: "contact not found" });
          return;
        }
        send(res, 200, {
          now,
          decision: result.decision,
          move: result.move,
          role: result.role,
          channel: result.channel,
          message: result.message,
          verdict: result.verdict,
          readiness: result.decision.readinessBefore,
          field: result.field,
          pressureRemaining: Math.max(0, (store.getContact(planMatch[1])?.pressureBudget ?? 0) - (store.getContact(planMatch[1])?.pressureSpent ?? 0)),
        });
        return;
      }

      const rewriteMatch = path.match(/^\/api\/contacts\/([^/]+)\/rewrite$/);
      if (rewriteMatch && method === "POST") {
        const body = await readBody(req);
        const now = new Date().toISOString();
        const contact = store.getContact(rewriteMatch[1]);
        const planResult = conductor.planFor(rewriteMatch[1], now);
        if (!contact || !planResult) {
          send(res, 404, { error: "contact not found" });
          return;
        }
        const original = String(body.body ?? planResult.message.body);
        const rewritten = await rewriteMessage({
          body: original,
          move: planResult.move,
          channel: planResult.channel,
          guard: planResult.move.guard,
          claimIds: planResult.message.claimIds,
        });
        const numbers = [
          contact.estimatedTicket,
          contact.missedRevenuePerMonth,
          contact.lostCallsPerMonth,
          Number(contact.phone.replace(/\D/g, "")),
          ...contact.phone.split(/\D+/).filter(Boolean).map(Number),
          Number(store.state.tenant.ownerPhone.replace(/\D/g, "")),
          ...store.state.tenant.ownerPhone.split(/\D+/).filter(Boolean).map(Number),
        ];
        const verdict = store.evaluate(
          contact,
          {
            move: planResult.move,
            channel: planResult.channel,
            purpose: planResult.move.purpose,
            body: rewritten.body,
            claimIds: planResult.message.claimIds,
            initiatedBy: "human",
            isFirstContact: contact.outboundLog.length === 0,
            proofSegment: planResult.move.requires?.sameSegmentProof ? contact.trade : undefined,
            reviewAudience: "all_completed",
            allowedNumbers: numbers,
            roleAutonomy: "full",
          },
          now,
        );
        send(res, 200, {
          ...rewritten,
          body: verdict.allowed ? rewritten.body : original,
          original,
          verdict,
        });
        return;
      }

      const sendMatch = path.match(/^\/api\/contacts\/([^/]+)\/send$/);
      if (sendMatch && method === "POST") {
        const body = await readBody(req);
        const now = new Date().toISOString();
        const channel = body.channel as "sms" | "email" | "voice" | "web" | undefined;
        const result = conductor.dispatch(sendMatch[1], now, { channel });
        if (!result) {
          send(res, 404, { error: "contact not found" });
          return;
        }
        const contact = store.getContact(sendMatch[1]);
        const delivery = result.action && contact ? await deliverAction(result.action, contact) : null;
        send(res, 200, {
          now,
          decision: result.plan.decision,
          action: result.action ?? null,
          delivery,
          verdict: result.plan.verdict,
          message: result.plan.message,
          blocked: Boolean(result.blocked),
        });
        return;
      }

      const replyMatch = path.match(/^\/api\/contacts\/([^/]+)\/reply$/);
      if (replyMatch && method === "POST") {
        const body = await readBody(req);
        const text = String(body.text ?? "").slice(0, 2_000);
        if (!text) {
          send(res, 400, { error: "text is required" });
          return;
        }
        const now = new Date().toISOString();
        const result = conductor.handleReply(replyMatch[1], text, now, body.channel as "sms" | "email" | "voice" | undefined);
        send(res, 200, {
          now,
          ...result,
          decision: result?.plan?.decision,
          message: result?.action ? { body: result.action.body, subject: result.action.subject } : null,
        });
        return;
      }

      const consentMatch = path.match(/^\/api\/contacts\/([^/]+)\/consent$/);
      if (consentMatch && method === "POST") {
        const body = await readBody(req);
        const now = new Date().toISOString();
        store.recordConsent(
          consentMatch[1],
          {
            purpose: (body.purpose as "marketing" | "transactional" | "support" | "review") ?? "marketing",
            channel: (body.channel as "sms" | "email" | "voice" | "web") ?? "sms",
            granted: body.granted !== false,
            at: now,
            source: String(body.source ?? "console"),
          },
          now,
        );
        send(res, 200, store.hydrateContact(consentMatch[1], now));
        return;
      }

      const optOutMatch = path.match(/^\/api\/contacts\/([^/]+)\/optout$/);
      if (optOutMatch && method === "POST") {
        const now = new Date().toISOString();
        store.optOut(optOutMatch[1], now, "console request");
        send(res, 200, { ok: true, at: now });
        return;
      }

      if (path === "/api/tick" && method === "POST") {
        const body = await readBody(req);
        const now = new Date().toISOString();
        const results = conductor.tick(now, Number(body.limit ?? 4));
        const enriched = await Promise.all(
          results.map(async (r) => {
            const contact = store.getContact(r.plan.decision.contactId);
            const delivery = r.action && contact ? await deliverAction(r.action, contact) : null;
            return {
              contactId: r.plan.decision.contactId,
              moveId: r.plan.decision.moveId,
              channel: r.plan.channel,
              action: r.action ?? null,
              delivery,
              blocked: Boolean(r.blocked),
              whyNow: r.plan.decision.whyNow,
            };
          }),
        );
        send(res, 200, { now, results: enriched });
        return;
      }

      if (path === "/api/reload" && method === "POST") {
        const ok = store.reloadFromDisk();
        send(res, 200, { ok, contacts: store.contacts().length, events: store.log.events.length, chain: store.log.verify() });
        return;
      }

      if (path === "/api/business") {
        const now = new Date().toISOString();
        const view = store.portfolio(now);
        const byId = new Map(view.map((v) => [v.id, v]));
        const contacts = store.contacts().filter((c) => !c.optedOut && c.stage !== "exited");
        const bookings = store.state.bookings;
        const revenueRecovered = bookings.reduce((sum, b) => sum + b.value, 0);
        const aiCost = Number(process.env.CHOICE_MONTHLY_COST ?? 1_400);
        const nowMs = Date.parse(now);
        const actionsToday = store.state.actions.filter((a) => nowMs - Date.parse(a.at) <= 86_400_000);

        const signalLabel: Record<string, string> = {
          missed_call: "Missed call",
          inbound_call: "Inbound call",
          form_fill: "New inquiry",
          reply_objection_price: "Price objection",
          reply_objection_trust: "Trust objection",
          reply_objection_time: "Timing objection",
          reply_not_now: "Not now",
          job_completed: "Job completed",
          complaint: "Complaint",
          booking: "Booked",
          purchase: "Purchased",
          reply_positive: "Positive reply",
          reply_question: "Question",
          no_response: "No response",
          review_left: "Review left",
          human_handoff: "Wants a human",
          seasonal_event: "Seasonal trigger",
        };

        const isStop = (c: (typeof contacts)[number]) =>
          c.lastSignal?.type === "missed_call" ||
          c.tags.includes("past_customer") ||
          c.tags.includes("dormant") ||
          c.tags.includes("missed_call");
        const isTrust = (c: (typeof contacts)[number]) =>
          byId.get(c.id)?.binding === "trust" || c.tags.some((t) => t.startsWith("objection_")) || c.tags.includes("complaint");
        const isClose = (c: (typeof contacts)[number]) =>
          (byId.get(c.id)?.readiness ?? 0) >= 0.5 ||
          ["framed", "proven", "committed"].includes(byId.get(c.id)?.stage ?? "");

        const stopContacts = contacts.filter(isStop);
        const trustContacts = contacts.filter(isTrust);
        const closeContacts = contacts.filter(isClose);
        const pipelineValue = Math.round(
          view.filter((v) => v.stage !== "exited").reduce((sum, v) => sum + v.ticket * v.readiness * 0.35, 0),
        );
        const openReviews = contacts.filter(
          (c) => c.tags.includes("job_complete") && c.lastSignal?.type !== "review_left" && !c.doNotAskReview,
        ).length;
        const missedCalls = contacts.reduce((sum, c) => sum + c.lostCallsPerMonth, 0);

        const queue = contacts
          .map((c) => {
            const plan = conductor.planFor(c.id, now);
            const v = byId.get(c.id);
            if (!plan || !v) return null;
            return {
              id: c.id,
              name: `${c.firstName} ${c.lastName}`,
              company: c.company,
              stage: v.stage,
              situation: signalLabel[c.lastSignal?.type ?? ""] ?? "No recent signal",
              move: plan.move.label,
              moveId: plan.move.id,
              channel: plan.channel,
              value: c.estimatedTicket,
              readiness: v.readiness,
              blocked: !plan.verdict.allowed,
              why: plan.decision.whyNow,
            };
          })
          .filter(Boolean)
          .sort((a, b) => Number(b!.readiness) - Number(a!.readiness))
          .slice(0, 8);

        send(res, 200, {
          now,
          tenant: store.state.tenant,
          headline: {
            revenueRecovered,
            jobsBooked: bookings.length,
            callsAnswered: contacts.filter((c) => c.lastInboundAt).length,
            pipelineValue,
            missedCalls,
            openReviews,
            aiCost,
            roi: Number((revenueRecovered / Math.max(1, aiCost)).toFixed(1)),
            actionsToday: actionsToday.length,
          },
          phases: [
            {
              id: "stop",
              number: "01",
              name: "Stop the bleeding",
              system: "threat",
              neuro: "Cortisol · loss aversion",
              count: stopContacts.length,
              value: stopContacts.reduce((sum, c) => sum + c.missedRevenuePerMonth, 0),
              description:
                "Every missed call and every dead customer in the database is revenue leaking right now. The OS answers, re-opens the file, and puts a real number on the leak.",
              actions: [
                "Answer every missed call in under 60 seconds",
                "Work the existing customer list before buying new leads",
                "Name the leak with a verified, customer-specific number",
              ],
            },
            {
              id: "trust",
              number: "02",
              name: "Build trust",
              system: "social",
              neuro: "Oxytocin · social safety",
              description:
                "Trust is the constraint before the close. The OS sends same-trade proof, answers the objection that was actually raised, and puts a human on the line when trust is fragile.",
              count: trustContacts.length,
              value: Math.round(trustContacts.reduce((sum, c) => sum + c.estimatedTicket * 0.35, 0)),
              actions: [
                "Same-trade, same-market proof — never a generic testimonial",
                "Answer the real objection, with a claim attached",
                "Human handoff when the customer asks for one",
              ],
            },
            {
              id: "close",
              number: "03",
              name: "Close the job",
              system: "deliberative",
              neuro: "Dopamine · anticipation + clarity",
              description:
                "The decision is already emotional; the neocortex needs the math and one next step. The OS offers two real slots, states the next step plainly, and confirms it.",
              count: closeContacts.length,
              value: Math.round(closeContacts.reduce((sum, c) => sum + c.estimatedTicket, 0) * 0.35),
              actions: [
                "Two real slots, never invented scarcity",
                "One next step, with the time it takes",
                "Confirm and kill the no-show",
              ],
            },
          ],
          queue,
          connected: {
            delivery: Boolean(deliveryConfigFromEnv().url),
            llm: Boolean(llmConfigFromEnv()),
          },
        });
        return;
      }

      if (path === "/api/run-day" && method === "POST") {
        const body = await readBody(req);
        const now = new Date().toISOString();
        const results = conductor.tick(now, Number(body.limit ?? 8));
        const enriched = await Promise.all(
          results.map(async (r) => {
            const contact = store.getContact(r.plan.decision.contactId);
            const delivery = r.action && contact ? await deliverAction(r.action, contact) : null;
            return {
              contactId: r.plan.decision.contactId,
              name: contact ? `${contact.firstName} ${contact.lastName}` : r.plan.decision.contactId,
              moveId: r.plan.decision.moveId,
              move: r.plan.move.label,
              channel: r.plan.channel,
              action: r.action ?? null,
              delivery,
              blocked: Boolean(r.blocked),
              whyNow: r.plan.decision.whyNow,
              value: contact?.estimatedTicket ?? 0,
              deltaReadiness: r.plan.decision.deltaReadiness,
            };
          }),
        );
        const actioned = enriched.filter((r) => r.action);
        const moved = actioned.reduce((sum, r) => sum + r.value * (r.deltaReadiness / 100) * 0.35, 0);
        send(res, 200, {
          now,
          summary: {
            actions: actioned.length,
            waits: enriched.filter((r) => !r.action && !r.blocked).length,
            blocked: enriched.filter((r) => r.blocked).length,
            valueMoved: Math.round(moved),
          },
          results: enriched,
        });
        return;
      }

      if (path === "/api/experiment") {
        send(res, 200, experimentReport(store));
        return;
      }

      if (path === "/api/calendar/slots") {
        if (!CALENDAR) {
          send(res, 400, { ok: false, error: "Cal.diy is not configured. Set CALCOM_BASE_URL, CALCOM_API_KEY and CALCOM_EVENT_TYPE_ID." });
          return;
        }
        try {
          const slots = await getAvailableSlots(CALENDAR, new Date().toISOString());
          send(res, 200, { ok: true, configured: true, slots: slots.slice(0, 20) });
        } catch (error) {
          send(res, 502, { ok: false, configured: true, error: error instanceof Error ? error.message : "Cal.diy slots failed" });
        }
        return;
      }

      if (path === "/api/setup/status") {
        const channels = deliveryChannels();
        const contacts = store.contacts();
        const consented = contacts.filter((c) => c.consent.some((x) => x.granted)).length;
        const claims = store.claims.length;
        const hermes = hermesStatus();
        const checklist = [
          { id: "twilio", label: "Twilio SMS", ready: channels.sms, detail: channels.sms ? "Configured" : "Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM" },
          { id: "resend", label: "Resend email", ready: channels.email, detail: channels.email ? "Configured" : "Add RESEND_API_KEY and RESEND_FROM" },
          { id: "calendar", label: "Calendar holds", ready: Boolean(CALENDAR), detail: CALENDAR ? `${CALENDAR.baseUrl} · event ${CALENDAR.eventTypeId}` : "Add CALCOM_BASE_URL, CALCOM_API_KEY, CALCOM_EVENT_TYPE_ID" },
          { id: "contacts", label: "Customer list", ready: contacts.length > 0, detail: `${contacts.length} contacts` },
          { id: "consent", label: "Consent records", ready: consented > 0, detail: `${consented} contacts with consent` },
          { id: "claims", label: "Claim registry", ready: claims > 0, detail: `${claims} claims` },
          { id: "hermes", label: "Hermes ops analyst", ready: hermes.available, detail: hermes.available ? `${hermes.model} · ${hermes.provider}` : "Install Hermes" },
        ];
        send(res, 200, {
          channels: { ...channels, calendar: Boolean(CALENDAR) },
          counts: { contacts: contacts.length, consented, claims, actions: store.state.actions.length, bookings: store.state.bookings.length },
          hermes,
          publicUrl: process.env.CHOICE_PUBLIC_URL ?? "http://127.0.0.1:4177",
          checklist,
          next: checklist.find((x) => !x.ready) ?? null,
        });
        return;
      }

      if (path === "/webhooks/twilio" && method === "POST") {
        const raw = await readRawBody(req);
        const params = new URLSearchParams(raw);
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (authToken) {
          const publicBase = (process.env.CHOICE_PUBLIC_URL ?? `https://${req.headers.host}`).replace(/\/$/, "");
          const signedUrl = `${publicBase}${req.url ?? path}`;
          const expected = twilioSignature(signedUrl, params, authToken);
          const received = String(req.headers["x-twilio-signature"] ?? "");
          const a = Buffer.from(expected);
          const b = Buffer.from(received);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            res.writeHead(403, { "content-type": "text/plain" });
            res.end("invalid Twilio signature");
            return;
          }
        }

        const now = new Date().toISOString();
        const from = params.get("From") ?? "";
        const body = (params.get("Body") ?? "").trim();
        const callStatus = params.get("CallStatus") ?? "";
        const fromDigits = from.replace(/\D/g, "");
        const contact = store.contacts().find((c) => {
          const digits = c.phone.replace(/\D/g, "");
          return digits && (digits === fromDigits || digits.slice(-10) === fromDigits.slice(-10));
        });

        let resolved = contact;
        if (!resolved && fromDigits) {
          resolved = store.createContact(
            {
              firstName: "Inbound",
              lastName: fromDigits.slice(-4),
              company: "Unknown caller",
              city: store.state.tenant.city,
              phone: from,
              email: "",
              channelPreference: "sms",
              tags: ["inbound", "needs_name"],
              notes: "Created by the Twilio inbound webhook. Name and consent are missing.",
            },
            now,
          );
          store.recordSignal(resolved.id, "inbound_call", now, "twilio", "inbound message");
        }

        if (resolved && !body) {
          if (["no-answer", "busy", "failed", "canceled"].includes(callStatus)) {
            store.recordSignal(resolved.id, "missed_call", now, "twilio", `call ${callStatus}`);
          }
          res.writeHead(200, { "content-type": "text/xml" });
          res.end("<Response/>");
          return;
        }

        if (!resolved) {
          res.writeHead(200, { "content-type": "text/xml" });
          res.end("<Response/>");
          return;
        }

        const result = conductor.handleReply(resolved.id, body || "(missed call)", now, "sms");
        const reply = result?.reply?.trim() || "Got it. A person will follow up shortly.";
        res.writeHead(200, { "content-type": "text/xml; charset=utf-8" });
        res.end(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(reply)}</Message></Response>`);
        return;
      }

      if (path === "/api/hermes/status") {
        send(res, 200, hermesStatus());
        return;
      }

      if (path === "/api/hermes/ask" && method === "POST") {
        const body = await readBody(req);
        const question = String(body.prompt ?? "").trim().slice(0, 500);
        if (!question) {
          send(res, 400, { error: "prompt is required" });
          return;
        }
        const now = new Date().toISOString();
        const view = store.portfolio(now);
        const contacts = store.contacts();
        const nowMs = Date.parse(now);
        const top = view.slice(0, 6).map((v) => {
          const plan = conductor.planFor(v.id, now);
          return {
            name: v.name,
            situation: v.binding,
            move: plan?.move.label ?? "Wait",
            value: v.ticket,
            readiness: v.readiness,
            blocked: plan ? !plan.verdict.allowed : false,
          };
        });
        const snapshot: OpsSnapshot = {
          tenant: store.state.tenant.name,
          revenueRecovered: store.state.bookings.reduce((sum, b) => sum + b.value, 0),
          jobsBooked: store.state.bookings.length,
          pipelineValue: Math.round(view.reduce((sum, v) => sum + v.ticket * v.readiness * 0.35, 0)),
          missedCalls: contacts.reduce((sum, c) => sum + c.lostCallsPerMonth, 0),
          actionsToday: store.state.actions.filter((a) => nowMs - Date.parse(a.at) <= 86_400_000).length,
          openReviews: contacts.filter((c) => c.tags.includes("job_complete") && c.lastSignal?.type !== "review_left" && !c.doNotAskReview).length,
          top,
        };
        send(res, 200, await askHermes(snapshot, question));
        return;
      }

      if (path === "/api/events") {
        const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 80));
        send(res, 200, {
          chain: store.log.verify(),
          events: store.log.tail(limit).slice().reverse(),
        });
        return;
      }

      if (path === "/api/metrics") {
        send(res, 200, store.metrics(new Date().toISOString()));
        return;
      }

      if (path === "/api/policy") {
        send(res, 200, {
          settings: store.settings,
          rules: [
            { id: "consent", text: "Marketing requires channel-specific, unexpired consent." },
            { id: "quiet_hours", text: "No outbound voice or SMS outside 8:00–21:00 local." },
            { id: "frequency", text: "1 per 24h, 3 per 7d, 8 per 30d." },
            { id: "pressure", text: "Each contact has a finite 3.0 pressure budget." },
            { id: "claims", text: "Currency, percentages and large numbers must trace to a verified claim." },
            { id: "urgency", text: "Urgency only from a real, future event." },
            { id: "review", text: "Review requests go to every completed job; never only promoters." },
            { id: "loss", text: "No loss framing without a control step and safety above 0.35." },
            { id: "disclosure", text: "First voice turn discloses that the caller is an AI." },
            { id: "vulnerable", text: "Vulnerable contacts are escalated to a human, never pressured." },
          ],
          claims: SEED_CLAIMS,
        });
        return;
      }

      if (path === "/api/simulate" && method === "POST") {
        const body = await readBody(req);
        lastSim = runSimulation({
          contacts: Number(body.contacts ?? 800),
          days: Number(body.days ?? 21),
          seeds: Number(body.seeds ?? 6),
          avgTicket: Number(body.avgTicket ?? 14_500),
        });
        send(res, 200, lastSim);
        return;
      }

      if (path === "/api/simulate" && method === "GET") {
        send(res, 200, lastSim ?? runSimulation({ contacts: 800, days: 21, seeds: 6 }));
        return;
      }

      if (path === "/api/stream") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        });
        let last = 0;
        const timer = setInterval(() => {
          const events = store.log.events.filter((e) => e.seq > last);
          if (events.length > 0) {
            last = events.at(-1)!.seq;
            res.write(`data: ${JSON.stringify({ events, metrics: store.metrics(new Date().toISOString()) })}\n\n`);
          } else {
            res.write(": keepalive\n\n");
          }
        }, 2_500);
        req.on("close", () => clearInterval(timer));
        return;
      }

      if (path.startsWith("/api/")) {
        send(res, 404, { error: "unknown endpoint", path });
        return;
      }

      const file = safePath(path);
      if (!file) {
        send(res, 400, { error: "bad path" });
        return;
      }
      try {
        const info = await stat(file);
        if (!info.isFile()) throw new Error("not a file");
        const data = await readFile(file);
        res.writeHead(200, {
          "content-type": MIME[extname(file)] ?? "application/octet-stream",
          "cache-control": "no-cache",
        });
        res.end(data);
      } catch {
        const index = await readFile(join(PUBLIC, "index.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(index);
      }
    } catch (error) {
      send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  const port = options.port ?? Number(process.env.PORT ?? 4177);
  await new Promise<void>((resolvePromise) => server.listen(port, options.host ?? "127.0.0.1", resolvePromise));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    url: `http://127.0.0.1:${actualPort}`,
    port: actualPort,
    store,
    close: () =>
      new Promise<void>((resolvePromise, reject) => {
        server.close((err) => (err ? reject(err) : resolvePromise()));
      }),
  };
}
