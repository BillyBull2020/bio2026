import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KernelStore, DEFAULT_TENANT } from "../kernel/store.ts";
import { seedDemo } from "../kernel/seed.ts";
import { SEED_CLAIMS } from "../kernel/claims.ts";
import { DEFAULT_SETTINGS } from "../kernel/policy.ts";
import { Conductor } from "../kernel/conductor.ts";
import { runSimulation } from "../sim/engine.ts";
import { ROLES, VOICE_SKINS } from "../roles/registry.ts";
import { MOVES } from "../neuro/moves.ts";
import { DIMENSIONS, DIMENSION_META } from "../neuro/types.ts";
import { llmConfigFromEnv, rewriteMessage } from "../llm/gateway.ts";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const PUBLIC = join(ROOT, "public");
const DATA = join(ROOT, "data");

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
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function safePath(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const full = join(PUBLIC, normalized === "/" ? "index.html" : normalized);
  return full.startsWith(PUBLIC) ? full : null;
}

export async function startServer(options: { port?: number; dataDir?: string } = {}): Promise<ServerHandle> {
  const store = new KernelStore({
    tenant: DEFAULT_TENANT,
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

  const server = createServer(async (req, res) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

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
        send(res, 200, {
          now,
          decision: result.plan.decision,
          action: result.action ?? null,
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
        send(res, 200, {
          now,
          results: results.map((r) => ({
            contactId: r.plan.decision.contactId,
            moveId: r.plan.decision.moveId,
            channel: r.plan.channel,
            action: r.action ?? null,
            blocked: Boolean(r.blocked),
            whyNow: r.plan.decision.whyNow,
          })),
        });
        return;
      }

      if (path === "/api/reload" && method === "POST") {
        const ok = store.reloadFromDisk();
        send(res, 200, { ok, contacts: store.contacts().length, events: store.log.events.length, chain: store.log.verify() });
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
  await new Promise<void>((resolvePromise) => server.listen(port, "127.0.0.1", resolvePromise));
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
