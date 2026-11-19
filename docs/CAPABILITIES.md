# What the OS Does — Capability Map

This is the honest line between **works today**, **works when you add a provider**, and
**not built**.

## The loop

```
missed call / inbound text / CSV
        ↓
six-resource field (safety, trust, anticipation, clarity, agency, commitment)
        ↓
binding constraint → stage → legal move → channel → message
        ↓
policy gate (consent, quiet hours, frequency, pressure, claims, vulnerable, review)
        ↓
send (Twilio / Resend)  ·  hold slots (Cal.diy)  ·  hand off to a human
        ↓
event log (hash-chained) → metrics → Hermes report → next day
```

The kernel is deterministic. It does not “ask an agent what to do.” The only model is Hermes,
and it is read-only.

## Works with no external keys

| Capability | Status | Where |
|---|---|---|
| Import a customer list, consent per row | **Works** | `import-csv` |
| Brand the tenant (name, city, trade, ticket) | **Works** | `setup-tenant` |
| Score six resources and derive stage | **Works** | `src/neuro/field.ts` |
| Choose a legal move, channel and message | **Works** | `src/kernel/scheduler.ts` |
| Policy gate, pressure budget, quiet hours, STOP | **Works** | `src/kernel/policy.ts` |
| “Wait” as a first-class decision | **Works** | scheduler |
| Event-sourced, hash-chained log | **Works** | `src/kernel/store.ts` |
| Business cockpit, daily queue, Run my day | **Works** | `/api/business`, `/api/run-day` |
| Holdout + experiment report | **Works** | `/api/experiment` |
| Hermes daily focus / weekly report / risk list | **Works** | `/api/hermes/ask` |
| Self-test with mock providers | **Works** | `npm run selftest` |

In this mode **nothing is sent**. Actions are logged and marked skipped. This is the demo and
the safe shadow mode.

## Works when you add Twilio

| Capability | Status | Requirement |
|---|---|---|
| Send an approved SMS | **Works** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| Receive an inbound SMS reply | **Works** | Twilio webhook → `/webhooks/twilio` |
| STOP / unsubscribe | **Works** | same webhook; conductor opts out |
| Book from a reply (“Tuesday at 9”) | **Works locally** | records the booking in the OS |
| Record missed calls | **Works** | Twilio voice status callback → same webhook |
| Signature verification | **Works** | `X-Twilio-Signature` + `CHOICE_PUBLIC_URL` |
| 10DLC registration | **Not code** | Twilio console; required for US SMS |

## Works when you add Resend

| Capability | Status | Requirement |
|---|---|---|
| Send an approved email | **Works** | `RESEND_API_KEY`, `RESEND_FROM` |
| Unsubscribe / opt-out | **Works locally** | STOP intent in the conductor |
| Inbound email parsing | **Not built** | needs an inbound email provider/webhook |
| Domain authentication | **Not code** | SPF/DKIM/DMARC at the DNS provider |

## Works when you add Cal.diy / Cal.com

| Capability | Status | Requirement |
|---|---|---|
| Read real availability | **Works** | `CALCOM_BASE_URL`, `CALCOM_API_KEY`, `CALCOM_EVENT_TYPE_ID` |
| Put a real deadline on a hold | **Works** | adapter feeds `calendar_hold` |
| Reserve a slot | **Works** | `POST /v2/slots/reservations` |
| Create a booking | **Works** | `POST /v2/bookings` |
| Auto-book on inbound “book” intent | **Not wired** | next calendar task |
| Two-way reschedule/cancel sync | **Not built** | next calendar task |
| Google/Outlook calendar sync | **Cal.diy feature** | connect inside Cal.diy, not the OS |

## Not built

- Outbound voice calls or an AI receptionist. The OS can record a missed call; it does not answer
  the phone.
- Voicemail transcription, call recording, or live transfer.
- Ad management, lead purchasing, or list scraping.
- Invoicing, payments, accounting, inventory, payroll.
- CRM sync (HubSpot/Salesforce/Jobber/ServiceTitan).
- Google Business Profile review API. The OS asks for a review with a link; it does not post.
- Multi-tenant SaaS auth. Today: one tenant per deployment, Basic Auth.
- Mobile app.

Do not promise these in a demo.

## Agents and skills

There are **no autonomous agents** in the customer path. The “roles” are four deterministic
voices over one kernel:

| Role | What it is | What it is not |
|---|---|---|
| Concierge | First response, booking, handoff | A separate agent with its own memory |
| Reviver | Past-customer reactivation | A separate campaign brain |
| Advocate | Reviews, referrals, proof | A review-gating bot |
| Analyst | Reports, proof, owner view | An autonomous researcher |

**Hermes is the only model.** It is read-only. It receives a snapshot, returns text, and cannot
send, consent, book, run tools or write the log.

### Do we need to add skills to Hermes?

**No, not for the core loop.** The core loop is deterministic code. Hermes is a reporting and
analysis convenience.

Add a skill only when there is a specific, read-only job:

| Skill | When to add | Risk |
|---|---|---|
| Web research for a lead | When you want a company summary before a call | Citations required; no scraping behind a login; no invented facts |
| Calendar read | If Hermes must answer “what does next week look like?” | Read-only; never book |
| Document/report formatting | If the owner wants a PDF weekly report | No customer data leaves the tenant |
| CRM read | If Hermes must answer “what is in Jobber?” | OAuth scope, read-only, per-tenant |

Do **not** give Hermes the send path, the full contact list, or write tools. That is how you get
the 15-agent problem back.

## Test everything

```powershell
npm test          # 70 unit/integration tests
npm run selftest  # 9 end-to-end checks with mock Twilio/Resend/Cal.diy
npm run verify    # hash-chain check on the live data
```

`selftest` proves the wiring without spending a dollar. Then, in order:

1. Twilio test number: send one SMS to your own phone; reply STOP; confirm opt-out.
2. Resend test domain: send one email to your own inbox.
3. Cal.diy: create an event type, get a slot, reserve it, book it.
4. Import 10 real contacts with consent; run one day in shadow mode; read every message.
5. Turn on delivery for 10 contacts; compare to the holdout after 7 days.

## The decision

We do **not** fake actions through Hermes. If the kernel did not authorize it, it did not happen.
If a provider is not connected, the OS says “skipped,” not “sent.” That is the product.
