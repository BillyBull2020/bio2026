/* BioDynamX Choice OS — operator console.
   No framework. The kernel is the product; this is a window into it. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const S = {
  data: null,
  business: null,
  hermes: null,
  setup: null,
  view: "business",
  selectedId: null,
  detail: null,
  plan: null,
  filter: "all",
  events: [],
  sim: null,
  busy: false,
  lastEventSeq: 0,
};

const STAGE_ORDER = ["dormant", "signal", "open", "trusted", "framed", "proven", "committed", "sustained", "human", "paused", "exited"];

const RAIL_RULES = [
  { id: "consent", name: "Consent", codes: ["no_marketing_consent", "no_review_consent"], text: "Channel-specific, unexpired permission before any marketing or review request." },
  { id: "quiet", name: "Quiet hours", codes: ["quiet_hours"], text: "No voice or SMS outside 8:00–21:00 in the contact's own timezone." },
  { id: "frequency", name: "Frequency", codes: ["frequency_24h", "frequency_7d", "frequency_30d"], text: "One per 24 hours, three per week, eight per month." },
  { id: "pressure", name: "Pressure budget", codes: ["pressure_budget"], text: "Every contact has a finite 3.0 budget. Pressure is spent, not free." },
  { id: "claims", name: "Claim trace", codes: ["claim_required", "claim_missing", "claim_expired", "claim_segment", "untraceable_number"], text: "Currency, percentages and large numbers must trace to a verified claim." },
  { id: "urgency", name: "Real urgency", codes: ["manufactured_urgency", "unreal_deadline"], text: "Scarcity only from a real, future event. No manufactured deadlines." },
  { id: "review", name: "Review integrity", codes: ["review_gating", "review_gating_language", "review_opt_out"], text: "Every completed job is asked. No gating, no star instructions." },
  { id: "loss", name: "No threat without a door", codes: ["loss_without_safety", "loss_without_control"], text: "A named loss must be evidenced and paired with a control step." },
  { id: "disclosure", name: "AI disclosure", codes: ["ai_disclosure"], text: "The first voice turn says plainly that the caller is an AI." },
  { id: "vulnerable", name: "Vulnerable contact", codes: ["vulnerable_contact"], text: "A human takes over. Automation never applies pressure here." },
  { id: "human", name: "Human approval", codes: ["human_approval", "draft_only"], text: "High-pressure moves and draft-only roles wait for a person." },
];

const BINDING_COPY = {
  safety: "No pressure, no shame, an easy exit.",
  trust: "Credible and on the customer's side. Proof beats promises.",
  anticipation: "A specific, believable better future is visible from here.",
  clarity: "Low cognitive load. One next step, no maze of options.",
  agency: "I am choosing this. It is not being done to me.",
  commitment: "A small action already taken. Momentum is real.",
};

const SYSTEM_COLOR = { threat: "#d9b45b", social: "#34d399", deliberative: "#a78bfa" };

const fmtMoney = (n) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1_000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;
const fmtNum = (n) => new Intl.NumberFormat("en-US").format(Math.round(n));
const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const title = (s) => String(s ?? "").replaceAll("_", " ");
const initials = (name) => name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function toast(message, kind = "") {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.className = "toast";
  }, 5200);
}

function clock() {
  const now = new Date();
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(now);
  $("#clock").textContent = time;
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function clockTime(iso) {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Denver" }).format(new Date(iso));
}

/* ── boot ─────────────────────────────────────────────────── */

async function boot() {
  clock();
  setInterval(clock, 1000);
  try {
    S.data = await api("/api/state");
    S.business = await api("/api/business").catch(() => null);
    renderAll();
    if (S.business) renderBusiness(S.business);
    loadHermesStatus();
    loadSetupStatus();
    const first = S.data.contacts.find((c) => c.name === "Dana Whitfield") ?? S.data.contacts[0];
    if (first) await selectContact(first.id);
    await loadEvents();
    loadSimulation();
    if (!location.search.includes("static=1")) subscribe();
  } catch (err) {
    toast(`Kernel unreachable: ${err.message}`, "bad");
  }
}

function renderAll() {
  const { tenant, metrics } = S.data;
  $("#tenant-name").textContent = tenant.name;
  $("#chain-state").textContent = metrics.chainOk ? "verified" : "broken";
  renderKpis(metrics);
  renderRoster();
  renderClaims(S.detail);
}

/* ── business view ───────────────────────────────────────── */

const PHASE_COLOR = { threat: "#d9b45b", social: "#34d399", deliberative: "#a78bfa" };

function renderBusiness(b) {
  $("#biz-tenant").textContent = b.tenant.name;
  const h = b.headline;
  const kpis = [
    { label: "Revenue recovered", value: fmtMoney(h.revenueRecovered), sub: `${fmtNum(h.jobsBooked)} booked jobs`, accent: "#34d399" },
    { label: "Pipeline at stake", value: fmtMoney(h.pipelineValue), sub: `${fmtNum(h.missedCalls)} missed calls / mo`, accent: "#d9b45b" },
    { label: "Actions today", value: fmtNum(h.actionsToday), sub: `${fmtMoney(h.aiCost)} / mo AI cost`, accent: "#a78bfa" },
    { label: "Return on AI", value: `${Number(h.roi).toFixed(1)}x`, sub: `on ${fmtMoney(h.aiCost)} / mo`, accent: "#3b82f6" },
    { label: "Reviews to ask", value: fmtNum(h.openReviews), sub: "every completed job, no gating", accent: "#d9b45b" },
    { label: "Calls answered", value: fmtNum(h.callsAnswered), sub: "inbound conversations", accent: "#34d399" },
  ];
  $("#biz-kpis").innerHTML = kpis
    .map(
      (k) => `<div class="biz-kpi" style="--accent:${k.accent}">
        <span class="bk-label">${esc(k.label)}</span>
        <span class="bk-value">${esc(k.value)}</span>
        <span class="bk-sub">${k.sub}</span>
      </div>`,
    )
    .join("");

  $("#phase-grid").innerHTML = b.phases
    .map((p) => {
      const color = PHASE_COLOR[p.system] ?? "#a78bfa";
      return `<article class="phase" style="--phase-color:${color}">
        <div class="p-top"><span class="p-num">PHASE ${esc(p.number)}</span><span class="p-neuro">${esc(p.neuro)}</span></div>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description)}</p>
        <div class="p-stats">
          <div class="p-stat"><span class="v">${fmtNum(p.count)}</span><span class="l">contacts</span></div>
          <div class="p-stat"><span class="v">${fmtMoney(p.value)}</span><span class="l">at stake</span></div>
        </div>
        <ul>${p.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
      </article>`;
    })
    .join("");

  $("#queue-count").textContent = `${b.queue.length} open`;
  $("#biz-queue").innerHTML = b.queue.length
    ? b.queue
        .map(
          (q) => `<div class="queue-row" data-id="${q.id}" role="button" tabindex="0">
            <div class="q-name"><b>${esc(q.name)}</b><span>${esc(q.situation)} · ${esc(title(q.stage))}</span></div>
            <div class="q-move">${esc(q.move)}<span>${esc(q.channel)}</span></div>
            <div class="q-value">${fmtMoney(q.value)}<span>${Math.round(q.readiness * 100)}% ready</span></div>
            <div class="q-status ${q.blocked ? "blocked" : ""}">${q.blocked ? "Blocked" : "Ready"}</div>
          </div>`,
        )
        .join("")
    : `<div class="sim-placeholder" style="padding:16px">No open decisions. Press “Run my day” or add contacts.</div>`;

  $("#owner-note").textContent = b.connected.delivery
    ? "Delivery is connected. “Run my day” sends through Twilio or Resend, after every rail passes."
    : "Demo mode: decisions are logged, not delivered. Add Twilio or Resend — see .env.example.";
}

/* ── Hermes ops analyst ───────────────────────────────────── */

async function loadHermesStatus() {
  const el = $("#hermes-status");
  if (!el) return;
  try {
    const status = await api("/api/hermes/status");
    S.hermes = status;
    el.textContent = status.available ? `${status.model} · ${status.provider}` : "not installed";
    el.style.color = status.available ? "#34d399" : "#ef4444";
  } catch {
    el.textContent = "unavailable";
    el.style.color = "#ef4444";
  }
}

async function loadSetupStatus() {
  const grid = $("#setup-grid");
  const next = $("#setup-next");
  if (!grid || !next) return;
  try {
    const setup = await api("/api/setup/status");
    S.setup = setup;
    next.textContent = setup.next ? `next: ${setup.next.label}` : "ready to run";
    next.style.color = setup.next ? "#d9b45b" : "#34d399";
    grid.innerHTML = setup.checklist
      .map(
        (item) => `<div class="setup-item ${item.ready ? "ready" : ""}">
          <span class="setup-dot"></span>
          <div><b>${esc(item.label)}</b><span>${esc(item.detail)}</span></div>
        </div>`,
      )
      .join("");
  } catch {
    next.textContent = "unavailable";
  }
}

async function askHermes(prompt) {
  const text = String(prompt ?? "").trim();
  if (!text) return;
  const btn = $("#hermes-btn");
  const input = $("#hermes-input");
  const answer = $("#hermes-answer");
  if (!answer || btn?.disabled) return;
  if (input) input.value = text;
  if (btn) btn.disabled = true;
  answer.className = "hermes-answer thinking";
  answer.textContent = "Hermes is reading the book…";
  try {
    const result = await api("/api/hermes/ask", { method: "POST", body: JSON.stringify({ prompt: text }) });
    if (!result.ok) {
      answer.className = "hermes-answer error";
      answer.textContent = result.error ?? "Hermes could not answer.";
      return;
    }
    answer.className = "hermes-answer";
    answer.textContent = result.text;
    const meta = document.createElement("span");
    meta.className = "h-meta";
    meta.textContent = `${result.model} · ${result.provider} · ${(result.durationMs / 1000).toFixed(1)}s · read-only`;
    answer.appendChild(meta);
  } catch (err) {
    answer.className = "hermes-answer error";
    answer.textContent = `Hermes failed: ${err.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function runDay() {
  const btn = $("#run-day-btn");
  if (!btn || btn.disabled) return;
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Running…";
  try {
    const res = await api("/api/run-day", { method: "POST", body: JSON.stringify({ limit: 8 }) });
    const s = res.summary;
    const acted = res.results.filter((r) => r.action);
    const chips = [
      `<span class="run-chip good"><b>${s.actions}</b> actions</span>`,
      `<span class="run-chip"><b>${s.waits}</b> waits</span>`,
      `<span class="run-chip ${s.blocked ? "gold" : ""}"><b>${s.blocked}</b> blocked</span>`,
      `<span class="run-chip gold"><b>${fmtMoney(s.valueMoved)}</b> moved</span>`,
      ...acted.slice(0, 5).map((r) => `<span class="run-chip"><b>${esc(r.name)}</b> ${esc(r.move)}</span>`),
    ];
    $("#run-results").innerHTML = chips.join("");
    $("#run-day-note").textContent = `${s.actions} actions · ${s.waits} waits · ${s.blocked} blocked`;
    toast(`Ran the day: ${s.actions} actions, ${s.waits} waits, ${s.blocked} blocked. ${fmtMoney(s.valueMoved)} moved.`, "good");
    S.data = await api("/api/state");
    renderAll();
    S.business = await api("/api/business");
    renderBusiness(S.business);
  } catch (err) {
    toast(`Run failed: ${err.message}`, "bad");
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

function switchView(view) {
  S.view = view;
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `${view}-view`));
  $$(".view-tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── kpis ─────────────────────────────────────────────────── */

function renderKpis(m) {
  const cards = [
    { label: "Contacts", value: fmtNum(m.active), sub: `${fmtNum(m.contacts)} total · ${fmtNum(m.contacts - m.active)} exited`, accent: "#a78bfa" },
    { label: "Ready now", value: fmtNum(m.ready), sub: "readiness ≥ 55%", accent: "#3b82f6" },
    { label: "Actions sent", value: fmtNum(m.actions), sub: `${fmtNum(m.decisions - m.actions)} decisions logged`, accent: "#d9b45b" },
    { label: "Booked", value: fmtNum(m.bookings), sub: `${fmtNum(m.committed)} committed or sustained`, accent: "#34d399" },
    { label: "Pipeline", value: fmtMoney(m.revenue), sub: "booked value", accent: "#d9b45b" },
    { label: "Opt-outs", value: fmtNum(m.optOuts), sub: Object.keys(m.blocked ?? {}).length ? `${fmtNum(Object.values(m.blocked).reduce((a, b) => a + b, 0))} policy blocks` : "no blocks", accent: "#ef4444" },
  ];
  $("#kpis").innerHTML = cards
    .map(
      (c) => `<div class="kpi" style="--accent:${c.accent}">
        <span class="k-label">${esc(c.label)}</span>
        <span class="k-value">${esc(c.value)}</span>
        <span class="k-sub">${c.sub}</span>
      </div>`,
    )
    .join("");
}

/* ── roster ───────────────────────────────────────────────── */

function stageClass(stage) {
  return STAGE_ORDER.includes(stage) ? stage : "dormant";
}

function renderRoster() {
  const contacts = S.data?.contacts ?? [];
  const filtered = contacts.filter((c) => {
    if (S.filter === "ready") return c.readiness >= 0.55 && c.stage !== "exited";
    if (S.filter === "human") return c.stage === "human";
    if (S.filter === "exited") return c.stage === "exited" || c.optedOut;
    return true;
  });

  $("#roster-count").textContent = `${filtered.length} / ${contacts.length}`;
  $("#roster-note").textContent = `${fmtNum(S.data.metrics.events)} events · chain ${S.data.metrics.chainOk ? "verified" : "BROKEN"}`;

  $("#contact-list").innerHTML = filtered
    .map((c) => {
      const selected = c.id === S.selectedId ? " selected" : "";
      const stage = c.optedOut ? "exited" : c.stage;
      const human = c.vulnerable || stage === "human";
      return `<div class="contact${selected}" data-id="${c.id}" role="button" tabindex="0">
        <div class="avatar">${esc(initials(c.name))}</div>
        <div class="c-main">
          <span class="c-name">${esc(c.name)}${human ? ' <span class="stage human" style="margin-left:5px">human</span>' : ""}</span>
          <span class="c-sub"><span class="stage ${stageClass(stage)}">${esc(title(stage))}</span><span class="c-city">${esc(c.city)}</span></span>
          <div class="bar"><i style="width:${Math.round(c.readiness * 100)}%;background:${c.readiness > 0.6 ? "#34d399" : c.readiness > 0.4 ? "#d9b45b" : "#5f5a6c"}"></i></div>
        </div>
        <div class="c-right">
          <span class="c-ready">${Math.round(c.readiness * 100)}%</span>
          <span class="c-binding">${esc(c.binding)}</span>
          <span class="c-binding" style="text-transform:none;letter-spacing:0">${timeAgo(c.lastTouch)}</span>
        </div>
      </div>`;
    })
    .join("");
}

/* ── selection ────────────────────────────────────────────── */

async function selectContact(id) {
  S.selectedId = id;
  renderRoster();
  try {
    const [detail, plan] = await Promise.all([api(`/api/contacts/${id}`), api(`/api/contacts/${id}/plan`)]);
    S.detail = detail;
    S.plan = plan;
    renderDecision();
    renderClaims(detail);
    document.querySelector(".contact.selected")?.scrollIntoView({ block: "nearest" });
  } catch (err) {
    toast(`Could not load contact: ${err.message}`, "bad");
  }
}

function radar(field) {
  const dims = S.data.dimensions;
  const cx = 170;
  const cy = 148;
  const r = 96;
  const n = dims.length;
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, value) => [cx + Math.cos(angle(i)) * r * value, cy + Math.sin(angle(i)) * r * value];
  const poly = dims.map((d, i) => pt(i, Math.max(0.03, field[d.id])).map((v) => v.toFixed(1)).join(",")).join(" ");

  const rings = [0.25, 0.5, 0.75, 1]
    .map((level) => {
      const points = dims.map((_, i) => pt(i, level).map((v) => v.toFixed(1)).join(",")).join(" ");
      return `<polygon points="${points}" fill="none" stroke="#262130" stroke-width="0.8" ${level === 1 ? 'stroke="#322b40"' : ""}/>`;
    })
    .join("");

  const axes = dims
    .map((_, i) => {
      const [x, y] = pt(i, 1);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#221e2d" stroke-width="0.8"/>`;
    })
    .join("");

  const dots = dims
    .map((d, i) => {
      const [x, y] = pt(i, Math.max(0.03, field[d.id]));
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="${SYSTEM_COLOR[d.system]}"/>`;
    })
    .join("");

  const labels = dims
    .map((d, i) => {
      const [x, y] = pt(i, 1.27);
      const anchor = Math.abs(Math.cos(angle(i))) < 0.25 ? "middle" : Math.cos(angle(i)) > 0 ? "start" : "end";
      const value = Math.round(field[d.id] * 100);
      return `<text x="${x.toFixed(1)}" y="${(y - 1).toFixed(1)}" fill="#7d8590" font-size="8.4" text-anchor="${anchor}" font-family="ui-monospace, monospace" letter-spacing=".08em">${d.label.toUpperCase()}</text>
        <text x="${x.toFixed(1)}" y="${(y + 9).toFixed(1)}" fill="#e8ebef" font-size="10.5" text-anchor="${anchor}" font-family="ui-monospace, monospace">${value}</text>`;
    })
    .join("");

  return `<defs>
      <radialGradient id="fieldFill" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stop-color="#8b5cf6" stop-opacity=".28"/>
        <stop offset="100%" stop-color="#3b82f6" stop-opacity=".10"/>
      </radialGradient>
    </defs>
    ${rings}${axes}
    <polygon points="${poly}" fill="url(#fieldFill)" stroke="#a78bfa" stroke-width="1.5" stroke-linejoin="round"/>
    ${dots}${labels}`;
}

function renderDecision() {
  const { contact, plan } = { contact: S.detail.contact, plan: S.plan };
  const decision = plan.decision;
  const field = plan.field ?? contact.field;

  $("#c-name").textContent = `${contact.firstName} ${contact.lastName}`;
  $("#c-meta").textContent = `${contact.company} · ${contact.city}, ${contact.state} · ${contact.trade} · prefers ${contact.channelPreference}`;

  const stage = contact.optedOut ? "exited" : contact.stage;
  const chips = [
    `<span class="chip ${stage === "human" ? "warn" : stage === "exited" ? "bad" : "good"}">${esc(title(stage))}</span>`,
    `<span class="chip">${esc(contact.channelPreference)}</span>`,
    `<span class="chip">${contact.consentSummary.length} consent</span>`,
    contact.vulnerable ? '<span class="chip warn">vulnerable</span>' : "",
    contact.doNotAskReview ? '<span class="chip warn">no review ask</span>' : "",
  ].filter(Boolean);
  $("#c-chips").innerHTML = chips.join("");

  $("#readiness-label").textContent = `readiness ${Math.round(plan.readiness * 100)}%`;
  $("#radar").innerHTML = radar(field);

  $("#field-legend").innerHTML = S.data.dimensions
    .map((d) => {
      const v = field[d.id];
      return `<div class="leg-row">
        <span class="leg-name">${esc(d.label)}</span>
        <div class="leg-bar"><i style="width:${Math.round(v * 100)}%;background:linear-gradient(90deg,${SYSTEM_COLOR[d.system]},#a78bfa)"></i></div>
        <span class="leg-val">${Math.round(v * 100)}</span>
      </div>`;
    })
    .join("");

  const binding = decision.binding;
  const bindingMeta = S.data.dimensions.find((d) => d.id === binding);
  $("#binding").innerHTML = `
    <span class="eyebrow">Binding constraint</span>
    <div class="b-title"><span class="b-name">${esc(bindingMeta?.label ?? binding)}</span><span class="b-gap">${Math.round(decision.bindingDeficit * 100)} pt gap</span></div>
    <p class="b-desc">${esc(BINDING_COPY[binding] ?? "")} The scheduler will not spend on a constraint it cannot move.</p>`;

  const move = plan.move;
  if (move.id === "wait") {
    $("#move-card").innerHTML = `
      <div>
        <span class="eyebrow">Next move</span>
        <div class="m-title">Wait</div>
        <div class="m-sub">Doing nothing is a first-class decision. The kernel logs it like any other.</div>
      </div>
      <div class="move-stats">
        <div class="stat"><span class="s-val">0.00</span><span class="s-label">pressure</span></div>
      </div>
      <p class="why">${esc(decision.whyNow)}</p>`;
  } else {
    $("#move-card").innerHTML = `
      <div>
        <span class="eyebrow">Next move · ${esc(plan.role.name)} · ${esc(plan.channel)}</span>
        <div class="m-title">${esc(move.label)}</div>
        <div class="m-sub">${esc(move.intent)}</div>
      </div>
      <div class="move-stats">
        <div class="stat"><span class="s-val">+${Number(decision.deltaReadiness).toFixed(1)}</span><span class="s-label">readiness</span></div>
        <div class="stat"><span class="s-val">${move.pressure.toFixed(2)}</span><span class="s-label">pressure</span></div>
      </div>
      <p class="why">${esc(decision.whyNow)}</p>`;
  }

  const msg = plan.message ?? { body: "" };
  const verdict = plan.verdict;
  const blocked = !verdict.allowed;
  const warnings = verdict.issues.filter((i) => i.severity === "warn").length;
  const verdictEl = $("#message-verdict");
  verdictEl.textContent = blocked ? `Blocked · ${verdict.issues.filter((i) => i.severity === "block").length} rail(s)` : warnings ? `Clear · ${warnings} warning(s)` : "Policy clear";
  verdictEl.className = `verdict${blocked ? " blocked" : warnings ? " warn" : ""}`;

  const messageEl = $("#message");
  messageEl.className = `message${msg.body ? "" : " empty"}`;
  messageEl.replaceChildren();
  if (msg.subject) {
    const subject = document.createElement("span");
    subject.className = "subject";
    subject.textContent = `Subject · ${msg.subject}`;
    messageEl.appendChild(subject);
  }
  const body = document.createElement("div");
  body.textContent = msg.body || (move.id === "wait" ? "No message. The correct action is none." : "No draft.");
  messageEl.appendChild(body);

  const acts = S.detail.actions.slice(0, 4).map((a) => ({ dir: "out", at: a.at, text: a.body }));
  const reps = S.detail.replies.slice(0, 4).map((r) => ({ dir: "in", at: r.at, text: r.text }));
  const thread = [...acts, ...reps].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-4);
  $("#thread").innerHTML = thread
    .map((t) => `<div class="thread-item ${t.dir}"><b>${t.dir === "out" ? "Out" : "In"} ${clockTime(t.at)}</b><span>${esc(t.text.slice(0, 240))}</span></div>`)
    .join("");

  const sendDisabled = blocked || move.id === "wait" || contact.optedOut;
  $("#actions").innerHTML = `
    <button class="btn primary" id="send-btn" ${sendDisabled ? "disabled" : ""}>Send ${move.id === "wait" ? "" : `via ${esc(plan.channel)}`}</button>
    <button class="btn ghost" id="replan-btn">Re-plan</button>
    <span class="spacer"></span>
    <button class="btn ghost small" id="copy-btn">Copy</button>
    <button class="btn danger small" id="optout-btn" ${contact.optedOut ? "disabled" : ""}>Opt out</button>`;

  $("#send-btn")?.addEventListener("click", sendCurrent);
  $("#replan-btn")?.addEventListener("click", () => selectContact(contact.id));
  $("#copy-btn")?.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(msg.body ?? "");
    toast("Message copied.");
  });
  $("#optout-btn")?.addEventListener("click", optOutCurrent);

  renderAlternatives(decision);
  renderRails(verdict, contact);
  renderBudget(contact);
}

function renderAlternatives(decision) {
  const rows = decision.alternatives ?? [];
  $("#alternatives").innerHTML = `
    <div class="alt-head"><span class="eyebrow">Why not the others</span><span class="mono" style="font-size:9px;color:#626a76">${rows.length} candidates scored</span></div>
    <table class="alt-table">
      <thead><tr><th>Move</th><th>Score</th><th>Δ readiness</th><th>Status</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (a) => `<tr>
              <td>${esc(title(a.moveId))}</td>
              <td class="num">${Number(a.score).toFixed(2)}</td>
              <td class="num">${a.deltaReadiness >= 0 ? "+" : ""}${Number(a.deltaReadiness).toFixed(2)}</td>
              <td>${a.blocked ? `<span class="no">blocked</span>` : '<span style="color:#34d399">legal</span>'}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderRails(verdict, contact) {
  const issues = verdict.issues ?? [];
  const rendered = RAIL_RULES.map((rail) => {
    const found = issues.filter((i) => rail.codes.includes(i.code));
    const block = found.find((i) => i.severity === "block");
    const warn = found.find((i) => i.severity === "warn");
    const state = block ? "block" : warn ? "warn" : "pass";
    const detail = block ?? warn;
    return `<div class="rail ${state}">
      <span class="r-ico">${state === "pass" ? "✓" : state === "warn" ? "!" : "×"}</span>
      <div><div class="r-name">${esc(rail.name)}</div><div class="r-text">${esc(detail ? detail.message : rail.text)}</div></div>
    </div>`;
  });
  $("#rails").innerHTML = rendered.join("");
  $("#rail-status").textContent = verdict.allowed ? "clear" : "blocked";
  $("#rail-status").style.color = verdict.allowed ? "#34d399" : "#ef4444";
}

function renderBudget(contact) {
  const spent = contact.pressureSpent ?? 0;
  const budget = contact.pressureBudget ?? 3;
  const pct = Math.min(100, Math.round((spent / budget) * 100));
  $("#budget").innerHTML = `
    <div class="budget-head"><span>Pressure budget</span><span class="mono">${spent.toFixed(2)} / ${budget.toFixed(2)}</span></div>
    <div class="budget-bar"><i style="width:${pct}%"></i></div>
    <div class="budget-note">${(budget - spent).toFixed(2)} remaining. The budget is the ethical ceiling, not a target.</div>`;
}

function renderClaims(detail) {
  const claims = detail?.contact?.availableClaims ?? S.data?.claims ?? [];
  $("#claims-count").textContent = String(claims.length);
  $("#claims").innerHTML = claims
    .slice(0, 5)
    .map(
      (c) => `<div class="claim"><div class="cl-id">${esc(c.id)}${c.segment ? ` · ${esc(c.segment)}` : ""}</div><div class="cl-text">${esc(String(c.text).slice(0, 150))}${String(c.text).length > 150 ? "…" : ""}</div></div>`,
    )
    .join("");
}

/* ── actions ──────────────────────────────────────────────── */

async function sendCurrent() {
  if (S.busy || !S.selectedId) return;
  S.busy = true;
  const btn = $("#send-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
  try {
    const res = await api(`/api/contacts/${S.selectedId}/send`, { method: "POST", body: JSON.stringify({ channel: S.plan?.channel }) });
    if (res.blocked) {
      toast(`Blocked by policy: ${res.verdict.issues.filter((i) => i.severity === "block").map((i) => i.message).join("; ")}`, "bad");
    } else {
      toast(`Sent via ${res.action?.channel ?? S.plan?.channel}. Decision and policy verdict recorded.`, "good");
    }
    await refresh();
    await selectContact(S.selectedId);
  } catch (err) {
    toast(`Send failed: ${err.message}`, "bad");
  } finally {
    S.busy = false;
  }
}

async function optOutCurrent() {
  if (!S.selectedId) return;
  try {
    await api(`/api/contacts/${S.selectedId}/optout`, { method: "POST" });
    toast("Opt-out recorded globally. All marketing contact is now blocked.", "good");
    await refresh();
    await selectContact(S.selectedId);
  } catch (err) {
    toast(`Opt-out failed: ${err.message}`, "bad");
  }
}

async function reply(text) {
  if (!S.selectedId || !text.trim()) return;
  $("#reply-btn").disabled = true;
  try {
    const res = await api(`/api/contacts/${S.selectedId}/reply`, { method: "POST", body: JSON.stringify({ text }) });
    const body = res.message?.body ?? res.reply;
    toast(`Classified as “${title(res.intent)}”. ${body ? `Next: ${body.slice(0, 180)}` : "Logged."}`, "good");
    $("#reply-input").value = "";
    await refresh();
    await selectContact(S.selectedId);
  } catch (err) {
    toast(`Reply failed: ${err.message}`, "bad");
  } finally {
    $("#reply-btn").disabled = false;
  }
}

async function runTick() {
  try {
    const res = await api("/api/tick", { method: "POST", body: JSON.stringify({ limit: 4 }) });
    const sent = res.results.filter((r) => r.action).length;
    const blocked = res.results.filter((r) => r.blocked).length;
    toast(`Cycle complete: ${sent} action(s), ${blocked} blocked, ${res.results.length - sent - blocked} wait.`, "good");
    await refresh();
    if (S.selectedId) await selectContact(S.selectedId);
  } catch (err) {
    toast(`Cycle failed: ${err.message}`, "bad");
  }
}

async function refresh() {
  S.data = await api("/api/state");
  renderAll();
  S.business = await api("/api/business").catch(() => S.business);
  if (S.business) renderBusiness(S.business);
}

/* ── events ───────────────────────────────────────────────── */

async function loadEvents() {
  const res = await api("/api/events?limit=60");
  S.events = res.events;
  S.lastEventSeq = res.events[0]?.seq ?? 0;
  renderEvents(res.chain);
}

function renderEvents(chain) {
  $("#log-chain").textContent = chain?.ok ? `chain verified · ${chain.count}` : "chain broken";
  $("#log-chain").style.color = chain?.ok ? "#34d399" : "#ef4444";
  $("#log-table").innerHTML = S.events
    .slice(0, 60)
    .map((e) => {
      const hot = ["action.sent", "contact.opted_out", "booking.created"].includes(e.type);
      return `<div class="log-row${hot ? " hot" : ""}">
        <span class="l-seq">${String(e.seq).padStart(3, "0")}</span>
        <span class="l-type">${esc(e.type)}</span>
        <span class="l-actor">${esc(e.actor)}${e.contactId ? ` · ${esc(e.contactId.slice(-6))}` : ""}</span>
        <span class="l-time">${clockTime(e.at)}</span>
      </div>`;
    })
    .join("");
}

function subscribe() {
  try {
    const source = new EventSource("/api/stream");
    source.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (!payload.events) return;
      const fresh = payload.events.filter((e) => e.seq > S.lastEventSeq);
      if (fresh.length === 0) return;
      S.lastEventSeq = fresh.at(-1).seq;
      S.events = [...fresh.slice().reverse(), ...S.events].slice(0, 80);
      renderEvents({ ok: payload.metrics.chainOk, count: payload.metrics.events });
      renderKpis(payload.metrics);
    };
  } catch {
    /* SSE is an enhancement, not a requirement. */
  }
}

/* ── simulation ───────────────────────────────────────────── */

async function loadSimulation() {
  $("#sim-status").textContent = "running";
  try {
    const res = await api("/api/simulate", {
      method: "POST",
      body: JSON.stringify({ contacts: Number($("#sim-contacts").value), days: Number($("#sim-days").value), seeds: Number($("#sim-seeds").value) }),
    });
    S.sim = res;
    renderSimulation(res);
    $("#sim-status").textContent = "complete";
  } catch (err) {
    $("#sim-status").textContent = "error";
    $("#sim-results").innerHTML = `<div class="sim-placeholder">Simulation failed: ${esc(err.message)}</div>`;
  }
}

function simRow(label, base, os, format, betterWhenLower = false) {
  const max = Math.max(base, os, 0.0001);
  const delta = base === 0 ? 0 : ((os - base) / base) * 100;
  const improved = betterWhenLower ? delta < 0 : delta > 0;
  const deltaClass = improved ? "up" : delta === 0 ? "" : "down";
  const deltaText = `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
  return `<div class="sim-row">
    <span class="sim-metric">${esc(label)}</span>
    <div class="sim-bars">
      <div class="sim-bar base"><i style="width:${(base / max) * 100}%"></i></div>
      <div class="sim-bar os"><i style="width:${(os / max) * 100}%"></i></div>
    </div>
    <span class="sim-val"><b>${format(os)}</b><br><span class="sim-delta ${deltaClass}">${deltaText}</span></span>
  </div>`;
}

function renderSimulation(r) {
  const b = r.baseline;
  const o = r.choiceos;
  const bookingLift = r.delta.bookingRatePct;
  const sendDelta = r.delta.sendsPct;
  const optDelta = r.delta.optOutRatePct;
  const revenueLift = r.delta.revenuePct;
  const bookingText = `${bookingLift > 0 ? "+" : ""}${bookingLift}% bookings`;
  const sendText = sendDelta < 0 ? `${Math.abs(sendDelta)}% fewer messages` : `${sendDelta}% more messages`;
  const optText = optDelta < 0 ? `${Math.abs(optDelta)}% fewer opt-outs` : `${optDelta}% more opt-outs`;
  const revenueText = `${revenueLift > 0 ? "+" : ""}${revenueLift}% revenue`;
  const summary = `Constraint-directed sequencing produced <b>${bookingText}</b> while sending <b>${sendText}</b>, producing <b>${optText}</b>, and returning <b>${revenueText}</b>. That is the argument: fewer, better-timed interventions, not more pressure.`;

  $("#sim-results").innerHTML = `
    <div class="sim-summary">${summary}</div>
    <div class="sim-grid">
      ${simRow("Bookings / contact", b.bookingRate, o.bookingRate, (v) => fmtPct(v))}
      ${simRow("Replies / contact", b.replyRate, o.replyRate, (v) => fmtPct(v))}
      ${simRow("Opt-outs / contact", b.optOutRate, o.optOutRate, (v) => fmtPct(v), true)}
      ${simRow("Sends / contact", b.sendsPerContact, o.sendsPerContact, (v) => Number(v).toFixed(2), true)}
      ${simRow("Revenue / 1k contacts", b.revenuePer1k, o.revenuePer1k, (v) => fmtMoney(v))}
    </div>
    <div class="sim-legend"><span><i style="background:#4a4557"></i>Persona blasting</span><span><i style="background:#8b5cf6"></i>Choice OS</span><span>${r.config.contacts} contacts · ${r.config.days} days · ${r.config.seeds} seeds</span></div>
    <details class="sim-assumptions"><summary>Model assumptions</summary><ul>${r.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details>`;
}

/* ── wiring ───────────────────────────────────────────────── */

document.addEventListener("click", (event) => {
  const viewTab = event.target.closest?.(".view-tab");
  if (viewTab) switchView(viewTab.dataset.view);

  const queueRow = event.target.closest?.(".queue-row");
  if (queueRow?.dataset.id) {
    switchView("kernel");
    selectContact(queueRow.dataset.id);
  }

  const contact = event.target.closest?.(".contact");
  if (contact?.dataset.id) selectContact(contact.dataset.id);

  const filter = event.target.closest?.(".filter");
  if (filter) {
    S.filter = filter.dataset.filter;
    $$(".filter").forEach((f) => f.classList.toggle("active", f === filter));
    renderRoster();
  }

  const quick = event.target.closest?.(".quick button");
  if (quick) reply(quick.dataset.text);

  const hermesQuick = event.target.closest?.(".hermes-quick button");
  if (hermesQuick?.dataset.prompt) askHermes(hermesQuick.dataset.prompt);
});

$("#reply-btn")?.addEventListener("click", () => reply($("#reply-input").value));
$("#reply-input")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") reply($("#reply-input").value);
});
$("#tick-btn")?.addEventListener("click", runTick);
$("#sim-btn")?.addEventListener("click", loadSimulation);
$("#run-day-btn")?.addEventListener("click", runDay);
$("#hermes-btn")?.addEventListener("click", () => askHermes($("#hermes-input")?.value));
$("#hermes-input")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") askHermes($("#hermes-input")?.value);
});

boot();
