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

The kernel produces an `ActionRecord`. `src/tools/delivery.ts` chooses the transport:

| Channel | Provider | Required env |
|---|---|---|
| SMS | Twilio Messages API | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (or `TWILIO_MESSAGING_SERVICE_SID`) |
| Email | Resend | `RESEND_API_KEY`, `RESEND_FROM` |
| Any | Generic webhook | `CHOICE_WEBHOOK_URL`, optional `CHOICE_WEBHOOK_TOKEN` |

No vendor SDK. Twilio is form-encoded Basic Auth; Resend is JSON Bearer. If no provider is
configured, the action is still logged and the response says `skipped: true`. Nothing is
silently sent.

```powershell
$env:TWILIO_ACCOUNT_SID="AC..."
$env:TWILIO_AUTH_TOKEN="..."
$env:TWILIO_FROM="+13035550100"
$env:RESEND_API_KEY="re_..."
$env:RESEND_FROM="Ray <ray@yourdomain.com>"
$env:CHOICE_PUBLIC_URL="https://os.yourdomain.com"
```

### Inbound SMS and missed calls

The server exposes `POST /webhooks/twilio` (excluded from Basic Auth, verified with
`X-Twilio-Signature` when `TWILIO_AUTH_TOKEN` is set). Point the Twilio number's **A message
comes in** webhook at:

```text
https://os.yourdomain.com/webhooks/twilio
```

The handler:

1. verifies the signature against `CHOICE_PUBLIC_URL` + the request path,
2. matches `From` to a contact by phone, creating an `Inbound` contact if unknown,
3. records the reply and a signal,
4. calls `conductor.handleReply(contactId, text, now, "sms")`,
5. returns TwiML with the reply.

A voice status callback to the same URL records `no-answer`, `busy`, `failed` and `canceled`
as `missed_call`, which feeds the **Stop the bleeding** phase.

`CHOICE_PUBLIC_URL` must be the exact public origin Twilio signs. If it is wrong, valid
webhooks return `403`.

### Calendar

`calendar_hold` requires a real deadline. The adapter should create two actual holds before
the kernel is allowed to offer them:

```ts
const holds = await calendar.holdTwoSlots(contact.timezone, now);
conductor.dispatch(contactId, now, { facts: { slotA: holds.a, slotB: holds.b } });
```

If the calendar is unavailable, the move is blocked by `unreal_deadline`. That is the correct
failure. Calendar is not connected in the pilot yet; **do not promise a hold** until it is.

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
# or TWILIO_MESSAGING_SERVICE_SID=MG...
RESEND_API_KEY=...
RESEND_FROM="Your Company <hello@yourdomain.com>"
CHOICE_PUBLIC_URL=https://os.yourdomain.com

# optional: Hermes read-only ops analyst
HERMES_BIN=C:\Users\you\AppData\Local\hermes\bin\hermes.exe
HERMES_PROVIDER=google
HERMES_MODEL=gemini-3.8-flash

# optional console protection (Basic Auth). Set both to enable.
CHOICE_CONSOLE_USER=billy
CHOICE_CONSOLE_PASS=choose-a-long-password
```

The kernel runs without any of these. It will simply log actions instead of delivering them.
If `CHOICE_CONSOLE_USER` and `CHOICE_CONSOLE_PASS` are set, every route except `/api/health`
and `/webhooks/twilio` requires Basic Auth. This is mandatory before exposing the console
through a tunnel.

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
