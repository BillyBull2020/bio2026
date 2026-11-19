# Start here

## The 10-second version

The console is already running:

**http://127.0.0.1:4177**

If it is not running, double-click **`Start-ChoiceOS.bat`**. It starts the kernel and opens the
console in your browser.

On your phone (same Wi-Fi), open **`http://10.0.0.16:4177`** while the launcher is running.
The launcher binds to `0.0.0.0` so the LAN can reach it. There is no login by default — only
do this on a trusted network.

---

## The Business tab is the product

The console opens on **Business**. It answers "what is this for?" in one screen:

- **Revenue recovered, pipeline at stake, return on AI** — the scoreboard the owner cares about.
- **Three phases** — Stop the bleeding (cortisol/loss), Build trust (oxytocin/safety), Close the job (dopamine/anticipation + clarity). Each phase shows the contacts in it, the dollars at stake, and what the OS does.
- **Today's queue** — the next move for every open contact, with value and readiness.
- **Run my day** — the OS ranks the book, plans the next legal move, checks every rail, sends or logs the action, and reports what moved.

Press **Run my day** first. Then open the **Kernel** tab to see *why* it chose each move.

The neurobiology is not decoration. Each phase maps to a different decision system and a
different business play:

| Phase | Customer question | Neuro-logic | Business play |
|---|---|---|---|
| **01 Stop the bleeding** | "Am I losing something?" | Cortisol, loss aversion | Answer the missed call, work the dead list, name the leak with a verified number. |
| **02 Build trust** | "Can I trust you?" | Oxytocin, social safety | Same-trade proof, answer the real objection, put a human on the line. |
| **03 Close the job** | "What do I do next?" | Dopamine, anticipation, clarity | Two real slots, one next step, confirm the booking. |

Under those phases, the kernel scores six resources for every person: **safety, trust,
anticipation, clarity, agency, commitment.** It moves the one that is actually blocking the
purchase, then stops. The 3.0 pressure budget and the policy rails are what keep that from
turning into manipulation.

### Hermes · the read-only operations analyst

Below the queue is **Hermes**. Ask it:

- “List all six contacts in the top array — name, move, value, readiness.”
- “Write a concise weekly owner report.”
- “Which contacts are at risk, and why?”
- “What is the single highest-value action this week?”

Hermes reads a compact snapshot — revenue, bookings, pipeline, missed calls, the top six
decisions — and writes plain text. It is **read-only**: it cannot send, change consent, book a
job, or write to the event log. That is deliberate; it is the owner's chief of staff, not a
second decision-maker.

### Go live in six steps

1. Configure the real business:
   `node src/cli.ts setup-tenant --name "Acme Roofing" --city "Aurora" --state "CO" --owner "Sam" --phone "+13035550100" --ticket 12000`.
2. Copy `.env.example` and add Twilio + Resend keys, a console password, and
   `CHOICE_PUBLIC_URL`.
3. Start Cal.diy and add `CALCOM_BASE_URL`, `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_ID` so the
   OS holds real slots. See `docs/CALENDAR.md`.
4. Import the real customer list: `node src/cli.ts import-csv --file customers.csv`. Consent
   is read per row and never invented.
5. Point the Twilio number's **A message comes in** webhook at
   `https://your-domain/webhooks/twilio` (POST). Voice status callbacks go to the same URL.
6. Open **Business** and watch the **Go-live checklist** turn green. The first missing item is
   the next thing to fix.

The checklist is live: Twilio, Resend, calendar, customer list, consent, claims, Stripe, CRM, Buffer social, Hermes.

---

## The Operator tab: Hermes with a job

The **Operator** tab is where Hermes stops being a reporter and starts doing work:

- **Find prospects** — researches local businesses with sources; no invented emails.
- **Social calendar** — drafts five posts.
- **Sales sequence** — drafts three emails.
- **CRM audit** — finds duplicates, consent gaps and stale records.
- **Send email** — drafts, then sends through Resend only after you approve.
- **Publish social** — drafts, then posts through your social webhook only after you approve.

Drafts are free. Sends and public posts stop at **Approve**. If Resend or the social webhook is
not configured, approval returns an error; it never pretends to send.

The four operator skills are installed in Hermes: `prospect-research`, `social-calendar`,
`sales-sequence`, `crm-hygiene`. Add business systems as MCP servers, not new agents:

```powershell
hermes mcp install airtable
hermes mcp install close
hermes mcp install klaviyo
hermes mcp install notion
hermes mcp install stripe
```

Full detail: [`docs/OPERATOR.md`](docs/OPERATOR.md).

---

## The Kernel tab: what you are looking at

### 1. Portfolio (left)

Every contact in the book, with their stage, readiness percentage and **binding constraint**.
Click any contact to load their decision.

The filters are:

- **All** — the whole book.
- **Ready** — readiness ≥ 55%.
- **Human** — a person must take over (complaint, vulnerable, handoff).
- **Exited** — opted out.

### 2. Decision field (center left)

Six resources: safety, trust, anticipation, clarity, agency, commitment. The polygon is the
current estimate. The lowest weighted gap is the **binding constraint** — the thing actually
blocking the decision.

### 3. Next move (center right)

- **Move** — the smallest legal intervention that addresses the constraint.
- **Role and channel** — who is allowed to send it, and where.
- **+readiness** — the expected gain in decision readiness.
- **pressure** — what the move costs from the contact's 3.0 budget.
- **Why now** — the scheduler's explanation, including the alternatives it rejected.

### 4. Message and rails

The drafted message is deterministic and claim-bound. The rail panel shows every policy check:
consent, quiet hours, frequency, pressure, claims, urgency, review integrity, AI disclosure,
vulnerable contacts. If a rail is red, the **Send** button is disabled. That is the product.

### 5. Simulate the customer

Type a reply or use a chip:

- **Sounds good** → booking intent
- **Price** → price objection
- **Not now** → timing intent
- **Is this AI?** → trust objection
- **STOP** → global opt-out

The kernel classifies the reply, updates the field, re-plans, and shows the next message.

### 6. Run cycle

Top right. The kernel ranks the portfolio and dispatches up to four decisions. It is allowed
to wait; a wait is logged like any other decision.

### 7. Simulation (bottom left)

Compares three-touch persona blasting with constraint-directed sequencing. Every assumption is
printed under the result. It is a model, not field data.

### 8. Event log (bottom right)

Every signal, decision, action, block, reply and opt-out. The chain is SHA-256-linked; if one
event changes, the chain breaks. `npm run verify` checks it from the command line.

---

## Useful commands

```bash
# run the kernel tests (51)
npm.cmd test

# seed a fresh demo book
node src/cli.ts reset
node src/cli.ts seed

# plan decisions without opening a browser
node src/cli.ts demo

# compare persona blasting with the kernel
node src/cli.ts simulate --contacts 800 --days 21 --seeds 6

# list the capability layer
node src/cli.ts tools

# generate a HyperFrames proof-video manifest
node src/cli.ts proof-video --contact <id>

# import a Sellbird export as zero-consent prospects
node src/cli.ts import-sellbird --file prospects.csv
```

---

## Add a password (recommended for LAN or a tunnel)

Set two environment variables before starting:

```powershell
$env:CHOICE_CONSOLE_USER="billy"
$env:CHOICE_CONSOLE_PASS="choose-a-long-password"
node src/cli.ts serve --host 0.0.0.0 --port 4177
```

The browser will prompt once. `/api/health` stays public for monitoring; everything else is
behind basic auth.

---

## Public demo (optional)

If you want a temporary public URL, use a Cloudflare quick tunnel **with the password set**:

```powershell
cloudflared tunnel --url http://127.0.0.1:4177
```

It prints a `https://...trycloudflare.com` URL. Keep the process running. The URL is
ephemeral, and anyone with the URL and password can use the console. Do not do this without
`CHOICE_CONSOLE_USER` / `CHOICE_CONSOLE_PASS`.

---

## Deploy

`Dockerfile` is included:

```bash
docker build -t biodynamx/choice-os .
docker run -p 4177:4177 -v choice-data:/app/data biodynamx/choice-os
```

For a real deployment, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The important caveat:
the JSONL event log needs a durable volume, or replace it with Postgres.

---

## What to look at first

1. Click **Dana Whitfield**. She is a past customer with a missed call and a form fill. Trust is
   the binding constraint, so the kernel chooses local proof — not a closer, not a discount.
2. Click **Priya Raman**. She objected on price. The kernel answers the objection with a claim,
   instead of sending proof or a calendar link.
3. Click **Ike Turner**. He has no consent. The kernel refuses to contact him. That is the rail
   that makes the rest credible.
4. Click **Run cycle**. Watch which contacts get an action and which get a wait.
5. Scroll to the simulation. Read the assumptions before the numbers.
