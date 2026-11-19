# Deployment and integration

## Two ways to run it

### 1. Standalone (fastest)

```bash
node src/cli.ts serve --port 4177
```

Open `http://127.0.0.1:4177`. The server:

- seeds a demo book into `data/events.jsonl` on first run,
- replays the log on restart,
- serves the console and JSON API,
- streams new events over SSE at `/api/stream`.

This is the right mode for a demo, a pilot walkthrough, or a single-tenant internal tool.

### 2. Inside the existing Next.js app (production path)

Copy `src/` into the Next repo as a workspace package, or publish it privately as
`@biodynamx/choice-os`. The kernel has no framework imports; the only Node-specific pieces
are `node:crypto`, `node:fs` and `node:http` (the latter only in the standalone server).

```
biodynamx/
├── packages/choice-os/        # this kernel
├── app/api/choice/...         # thin route handlers
└── lib/choice-store.ts        # singleton + adapter wiring
```

### Route handler

```ts
// app/api/choice/plan/route.ts
import { NextRequest } from "next/server";
import { getChoice } from "@/lib/choice-store";

export async function POST(req: NextRequest) {
  const { contactId, channel } = await req.json();
  const { conductor } = getChoice();
  const result = conductor.planFor(contactId, new Date().toISOString(), { channel });
  if (!result) return Response.json({ error: "contact not found" }, { status: 404 });
  return Response.json({
    decision: result.decision,
    move: result.move,
    channel: result.channel,
    message: result.message,
    verdict: result.verdict,
  });
}
```

```ts
// lib/choice-store.ts
import { KernelStore } from "@/packages/choice-os/kernel/store";
import { Conductor } from "@/packages/choice-os/kernel/conductor";
import { SEED_CLAIMS } from "@/packages/choice-os/kernel/claims";
import { DEFAULT_SETTINGS } from "@/packages/choice-os/kernel/policy";

let cached: { store: KernelStore; conductor: Conductor } | null = null;

export function getChoice() {
  if (!cached) {
    const store = new KernelStore({
      dataDir: process.env.CHOICE_DATA_DIR ?? "./data/choice",
      claims: SEED_CLAIMS,
      settings: DEFAULT_SETTINGS,
    });
    cached = { store, conductor: new Conductor(store, SEED_CLAIMS, DEFAULT_SETTINGS) };
  }
  return cached;
}
```

**Caveat:** a serverless runtime does not have a durable local filesystem. For Vercel or
Cloudflare Workers, replace the `EventLog` file writer with a Postgres/Neon/D1 adapter, or
run the kernel as a long-lived service (Fly.io, Railway, a small VM) and call it over HTTP.
The reducer and scheduler do not care where the events live; they care that `append` is
monotonic and durable.

---

## Delivery adapters

The kernel produces an `ActionRecord`. It does not call Twilio, Resend, or Google. Wire the
adapters after `dispatch` returns an action:

```ts
const result = conductor.dispatch(contactId, now);
if (result?.action) {
  if (result.action.channel === "sms") await twilio.messages.create({
    to: contact.phone,
    from: process.env.TWILIO_FROM,
    body: result.action.body,
  });
  if (result.action.channel === "email") await resend.emails.send({
    to: contact.email,
    from: "ray@summitridgeroofing.com",
    subject: result.action.subject ?? "",
    text: result.action.body,
  });
}
```

### Generic delivery webhook

The fastest path to a real send is a webhook, not a vendor SDK. Set:

```bash
CHOICE_WEBHOOK_URL=https://your-worker.example/send
CHOICE_WEBHOOK_TOKEN=optional-bearer
```

`POST /api/contacts/:id/send` (and `/api/tick`) will deliver the approved `ActionRecord` to
that URL with `to`, `channel`, `subject`, `body`, `moveId`, `claimIds`, `policyAllowed` and
the contact identity. The receiver owns Twilio, Resend, or whatever transport you use. If
the webhook is not configured, the action is still logged and the response says
`delivery: { ok: false, skipped: true }`. Nothing is silently sent.

This separation is deliberate: the policy gate must run before transport, and the kernel
must not care which vendor is behind it.

### Inbound

Twilio webhook → `conductor.handleReply(contactId, text, now, channel)`. The conductor:

1. classifies the intent,
2. writes the reply and the signal,
3. opts out on STOP,
4. books on a booking intent,
5. re-plans on the new state and returns the reply message.

Return the reply body as TwiML or send it through the same adapter. Never let a separate
"reply agent" write a second message.

### Calendar

`calendar_hold` requires a real deadline. The adapter should create two actual holds before
the kernel is allowed to offer them:

```ts
const holds = await calendar.holdTwoSlots(contact.timezone, now);
conductor.dispatch(contactId, now, { facts: { slotA: holds.a, slotB: holds.b } });
```

If the calendar is unavailable, the move is blocked by `unreal_deadline`. That is the
correct failure.

---

## Environment

```bash
# required for persistence in standalone mode
CHOICE_DATA_DIR=./data

# optional: provider for a rewrite-only model layer (not required)
CHOICE_LLM_BASE_URL=https://api.openai.com/v1
CHOICE_LLM_API_KEY=...
CHOICE_LLM_MODEL=gpt-4.1-mini

# delivery
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+1303...
RESEND_API_KEY=...

# optional console protection (Basic Auth). Set both to enable.
CHOICE_CONSOLE_USER=billy
CHOICE_CONSOLE_PASS=choose-a-long-password
```

The kernel runs without any of these. It will simply log actions instead of delivering them.
If `CHOICE_CONSOLE_USER` and `CHOICE_CONSOLE_PASS` are set, every route except `/api/health`
requires Basic Auth. This is mandatory before exposing the console through a tunnel.

---

## Shadow mode

Before sending a single OS message, run the kernel read-only:

1. For each contact the current system would contact, call `conductor.planFor`.
2. Store the decision, the message and the verdict in a shadow table.
3. Do not send.
4. Review three lists weekly:
   - **Would wait:** contacts the OS would leave alone. Is that right?
   - **Would block:** contacts the OS refuses. Which claim or consent is missing?
   - **Would say something different:** compare the OS move to the persona move.

Shadow mode is also how you build the claim registry: every "would block" is a missing
source, not a bug.

---

## Security and data handling

- **Consent is the access control.** No marketing action without a channel-specific record;
  opt-out is global.
- **The event log contains message bodies.** Treat `data/events.jsonl` as PII. Encrypt at
  rest, restrict access, and set a retention policy. In Postgres, use row-level security by
  tenant and a retention job.
- **Claims are evidence.** Store the source document, the verifier and the expiry. A claim
  without a source is a liability.
- **The console has no authentication in this build.** Put it behind your existing auth
  (NextAuth, Clerk, Cloudflare Access) before exposing it. Do not deploy it publicly as-is.
- **Model output is untrusted.** If you add an LLM, run the same policy gate on its output.
  Never let it choose the move, the claim or the deadline.

---

## Hosting options

| Option | Fit | Notes |
|---|---|---|
| Single VM / Fly.io / Railway | Best for the pilot | Durable disk for JSONL, SSE works, simple. |
| Next.js on Vercel + Postgres | Production web | Replace the file log with Postgres; keep the console as a client page. |
| Cloudflare Workers + D1 | Edge | Rewrite the event adapter; no `node:fs`. The kernel itself is portable. |
| Firebase | Existing stack | Use Firestore for events; the reducer stays. Call the kernel from a Cloud Function or a long-lived service. |

---

## Go-live checklist

- [ ] Claims registry populated for every number the copy uses.
- [ ] Consent records imported with source and timestamp.
- [ ] Quiet hours and frequency caps match the jurisdictions you operate in.
- [ ] Opt-out path tested end-to-end (reply STOP → global suppression → confirmation).
- [ ] Vulnerable flag tested (forced human, zero automated pressure).
- [ ] Event log backup and replay tested.
- [ ] Console behind auth.
- [ ] Shadow mode reviewed for two weeks.
- [ ] Pilot pre-registered with primary metric and guardrails.
- [ ] Rollback: keep the old sender behind a feature flag for one week.
