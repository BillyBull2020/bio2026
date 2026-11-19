#!/usr/bin/env node
import { rm, mkdir, readFile, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KernelStore, DEFAULT_TENANT } from "./kernel/store.ts";
import { seedDemo } from "./kernel/seed.ts";
import { SEED_CLAIMS } from "./kernel/claims.ts";
import { DEFAULT_SETTINGS } from "./kernel/policy.ts";
import { Conductor } from "./kernel/conductor.ts";
import { startServer } from "./api/server.ts";
import { runSimulation } from "./sim/engine.ts";
import { readiness, deriveStage } from "./neuro/field.ts";
import { TOOLS, listTools, toolById } from "./tools/registry.ts";
import { importContactsFromCsv } from "./tools/csv.ts";
import { runSelfTest } from "./selftest.ts";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const DATA = join(ROOT, "data");

const args = process.argv.slice(2);
const command = args[0] ?? "serve";
const flag = (name: string, fallback?: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

function line(char = "─", n = 78): string {
  return char.repeat(n);
}

function table(rows: string[][], headers: string[]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const render = (r: string[]) => r.map((cell, i) => cell.padEnd(widths[i])).join("  ");
  return [render(headers), widths.map((w) => "─".repeat(w)).join("  "), ...rows.map(render)].join("\n");
}

async function ensureData(): Promise<void> {
  await mkdir(DATA, { recursive: true });
}

async function commandSetupTenant(): Promise<void> {
  const name = flag("name");
  if (!name) {
    console.error('Usage: node src/cli.ts setup-tenant --name "Acme Roofing" [--trade roofing] [--city Denver] [--state CO] [--owner "Ray"] [--phone "+1303..."] [--ticket 14500] [--review URL]');
    process.exitCode = 1;
    return;
  }
  const tenant = {
    ...DEFAULT_TENANT,
    name,
    trade: flag("trade") ?? DEFAULT_TENANT.trade,
    city: flag("city") ?? DEFAULT_TENANT.city,
    state: flag("state") ?? DEFAULT_TENANT.state,
    ownerName: flag("owner") ?? DEFAULT_TENANT.ownerName,
    ownerPhone: flag("phone") ?? DEFAULT_TENANT.ownerPhone,
    avgTicket: Number(flag("ticket") ?? DEFAULT_TENANT.avgTicket),
    reviewLink: flag("review") ?? DEFAULT_TENANT.reviewLink,
  };
  await ensureData();
  await writeFile(join(DATA, "tenant.json"), `${JSON.stringify(tenant, null, 2)}\n`, "utf8");
  console.log(`\nTenant configured: ${tenant.name} · ${tenant.city}, ${tenant.state}`);
  console.log(`  trade: ${tenant.trade} · avg ticket: $${tenant.avgTicket.toLocaleString()} · owner: ${tenant.ownerName}`);
  console.log(`  written: ${join(DATA, "tenant.json")}`);
  console.log(`\nNext: node src/cli.ts import-csv --file customers.csv\n`);
}

async function commandDemo(): Promise<void> {
  const now = new Date().toISOString();
  const store = new KernelStore({ claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS, persist: false });
  seedDemo(store, now);
  const conductor = new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS);

  console.log(`\nBioDynamX CHOICE OS — kernel demo`);
  console.log(line());
  console.log(`${store.state.tenant.name} · ${store.state.tenant.city} · ${store.contacts().length} contacts · ${store.log.events.length} events`);
  console.log(`chain: ${store.log.verify().ok ? "verified" : "BROKEN"}\n`);

  const results = conductor.tick(now, 5);
  for (const result of results) {
    const { plan, action } = result;
    const c = store.getContact(plan.decision.contactId)!;
    console.log(`${c.firstName} ${c.lastName} — ${deriveStage(c, c.field, now)} — readiness ${(readiness(c.field) * 100).toFixed(0)}%`);
    console.log(`  move: ${plan.move.label} · ${plan.channel} · +${plan.decision.deltaReadiness} pts · pressure ${plan.move.pressure.toFixed(2)}`);
    console.log(`  why:  ${plan.decision.whyNow}`);
    if (action) {
      console.log(`  message:\n${action.body.split("\n").map((l) => `    ${l}`).join("\n")}`);
    }
    console.log("");
  }

  const blocked = store.state.blocked.length;
  console.log(line());
  console.log(`actions: ${store.state.actions.length} · decisions: ${store.state.decisions.length} · blocked: ${blocked} · bookings: ${store.state.bookings.length}`);
  console.log(`chain after run: ${store.log.verify().ok ? "verified" : "BROKEN"}`);
}

async function commandSimulate(): Promise<void> {
  const result = runSimulation({
    contacts: Number(flag("contacts", "800")),
    days: Number(flag("days", "21")),
    seeds: Number(flag("seeds", "6")),
  });
  const rows = [
    ["sends / contact", result.baseline.sendsPerContact.toFixed(2), result.choiceos.sendsPerContact.toFixed(2), `${result.delta.sendsPct}%`],
    ["reply rate", `${(result.baseline.replyRate * 100).toFixed(1)}%`, `${(result.choiceos.replyRate * 100).toFixed(1)}%`, `${result.delta.replyRatePct}%`],
    ["booking rate", `${(result.baseline.bookingRate * 100).toFixed(1)}%`, `${(result.choiceos.bookingRate * 100).toFixed(1)}%`, `${result.delta.bookingRatePct}%`],
    ["opt-out rate", `${(result.baseline.optOutRate * 100).toFixed(1)}%`, `${(result.choiceos.optOutRate * 100).toFixed(1)}%`, `${result.delta.optOutRatePct}%`],
    ["revenue / 1k", `$${result.baseline.revenuePer1k.toLocaleString()}`, `$${result.choiceos.revenuePer1k.toLocaleString()}`, `${result.delta.revenuePct}%`],
    ["complaints", String(result.baseline.complaints), String(result.choiceos.complaints), ""],
  ];
  console.log(`\nSimulation — ${result.config.contacts} contacts · ${result.config.days} days · ${result.config.seeds} seeds`);
  console.log(line());
  console.log(table(rows, ["metric", "persona blasting", "Choice OS", "delta"]));
  console.log(line());
  for (const assumption of result.assumptions) console.log(`· ${assumption}`);
}

async function commandVerify(): Promise<void> {
  await ensureData();
  const file = join(DATA, "events.jsonl");
  try {
    await readFile(file, "utf8");
  } catch {
    console.log("No event log yet. Run `npm run seed` or `npm run demo` first.");
    return;
  }
  const store = new KernelStore({ dataDir: DATA, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS });
  const result = store.log.verify();
  console.log(JSON.stringify({ ...result, contacts: store.contacts().length }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

async function commandReset(): Promise<void> {
  await rm(join(DATA, "events.jsonl"), { force: true });
  await rm(join(DATA, "snapshot.json"), { force: true });
  console.log("Kernel reset. Next start will reseed the demonstration book.");
}

async function commandSeed(): Promise<void> {
  await ensureData();
  const store = new KernelStore({ dataDir: DATA, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS });
  if (store.contacts().length > 0) {
    console.log(`Already seeded: ${store.contacts().length} contacts, ${store.log.events.length} events.`);
    return;
  }
  seedDemo(store, new Date().toISOString());
  console.log(`Seeded ${store.contacts().length} contacts and ${store.log.events.length} events into ${DATA}.`);
}

async function commandServe(): Promise<void> {
  const host = flag("host", "127.0.0.1")!;
  const port = Number(flag("port", process.env.PORT ?? "4177"));
  const server = await startServer({ port, host });
  const lans = Object.entries(networkInterfaces())
    .flatMap(([name, addrs]) =>
      (addrs ?? [])
        .filter((n) => n.family === "IPv4" && !n.internal)
        .filter((n) => !/tailscale|loopback/i.test(name) && !n.address.startsWith("100."))
        .map((n) => ({ name, address: n.address })),
    );
  console.log(`\nBioDynamX CHOICE OS`);
  console.log(`console  ${server.url}`);
  if (host === "0.0.0.0") {
    for (const lan of lans) console.log(`lan      http://${lan.address}:${port}  (${lan.name})`);
  }
  if (process.env.CHOICE_CONSOLE_USER) console.log(`login    basic auth enabled`);
  console.log(`api      ${server.url}/api/state`);
  console.log(`events   ${server.url}/api/events`);
  console.log(`kernel   ${server.store.contacts().length} contacts · ${server.store.log.events.length} events · chain ${server.store.log.verify().ok ? "verified" : "BROKEN"}`);
  console.log(`\nCtrl+C to stop.\n`);
}

async function commandTools(): Promise<void> {
  console.log("\nTools are capabilities, not agents. The kernel still decides.\n");
  console.log(
    table(
      listTools().map((t) => [t.id, t.permission, t.roles.join(", "), t.name]),
      ["tool", "permission", "roles", "what it does"],
    ),
  );
}

async function commandImportSellbird(): Promise<void> {
  const file = flag("file");
  if (!file) {
    console.error("Usage: node src/cli.ts import-sellbird --file prospects.csv");
    process.exitCode = 1;
    return;
  }
  await ensureData();
  const store = new KernelStore({ dataDir: DATA, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS });
  const tool = toolById("sellbird.import")!;
  const result = await tool.run({ file }, { tenant: store.state.tenant, now: new Date().toISOString(), store });
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }
  const out = result.output as { imported: number; skippedExisting: number; skippedNoEmail: number; contacts: string[]; warning: string };
  console.log(`\nImported ${out.imported} · skipped ${out.skippedExisting} existing · skipped ${out.skippedNoEmail} without email`);
  console.log(`contact ids: ${out.contacts.join(", ")}`);
  console.log(`\n${out.warning}\n`);
}

async function commandImportCsv(): Promise<void> {
  const file = flag("file");
  if (!file) {
    console.error("Usage: node src/cli.ts import-csv --file customers.csv");
    process.exitCode = 1;
    return;
  }
  await ensureData();
  const store = new KernelStore({ dataDir: DATA, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS });
  const text = await readFile(file, "utf8");
  const summary = importContactsFromCsv(store, text, new Date().toISOString());
  console.log(`\nImported ${summary.imported} contacts`);
  console.log(`  with consent:    ${summary.withConsent}`);
  console.log(`  without consent: ${summary.withoutConsent} (zero pressure, scheduler waits)`);
  console.log(`  skipped:         ${summary.skippedExisting} existing, ${summary.skippedNoContact} without email/phone`);
  console.log(`  contact ids:     ${summary.contacts.join(", ")}`);
  console.log(`\nNext: node src/cli.ts verify\n`);
}

async function commandProofVideo(): Promise<void> {
  const contactId = flag("contact");
  if (!contactId) {
    console.error("Usage: node src/cli.ts proof-video --contact <id> [--out data/proofs]");
    process.exitCode = 1;
    return;
  }
  await ensureData();
  const store = new KernelStore({ dataDir: DATA, claims: SEED_CLAIMS, settings: DEFAULT_SETTINGS });
  const tool = toolById("hyperframes.proof")!;
  const result = await tool.run(
    { contactId, outDir: flag("out", join(DATA, "proofs")) },
    { tenant: store.state.tenant, now: new Date().toISOString(), store },
  );
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }
  console.log(JSON.stringify(result.output, null, 2));
}

switch (command) {
  case "demo":
    await commandDemo();
    break;
  case "simulate":
    await commandSimulate();
    break;
  case "verify":
    await commandVerify();
    break;
  case "reset":
    await commandReset();
    break;
  case "seed":
    await commandSeed();
    break;
  case "setup-tenant":
    await commandSetupTenant();
    break;
  case "tools":
    await commandTools();
    break;
  case "import-sellbird":
    await commandImportSellbird();
    break;
  case "import-csv":
    await commandImportCsv();
    break;
  case "proof-video":
    await commandProofVideo();
    break;
  case "selftest":
    process.exitCode = (await runSelfTest()) ? 0 : 1;
    break;
  case "serve":
  default:
    await commandServe();
    break;
}
