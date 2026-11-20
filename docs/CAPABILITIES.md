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

The kernel is deterministic and owns **customer-facing decisions**. Hermes runs the rest of
the work — research, content, sales ops, reporting — through tools and skills. Sends and public
posts require approval.

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

## Works when you add Stripe, CRM or a social scheduler

| Capability | Status | Requirement |
|---|---|---|
| Create a subscription Checkout URL | **Works** | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` |
| Push the book to a CRM/automation | **Works** | `CRM_WEBHOOK_URL` (n8n, Make, Zapier, Airtable) |
| Publish an approved social post | **Works** | `BUFFER_API_KEY` + `BUFFER_CHANNEL_IDS`, or `SOCIAL_WEBHOOK_URL` |
| Public revenue-leak audit | **Works** | `https://biodynamx.com/audit` (instant number + email) |
| Host a public image/video URL | **Works** | `CHOICE_PUBLIC_URL` + `npm run media-add -- --file ...` |
| Operator research / content / sales drafts | **Works** | Hermes + free model |
| Operator send email after approval | **Works** | Resend configured |
| Operator social post after approval | **Works** | Buffer or social webhook configured |
| CRM write from the Operator | **Not built** | Add an MCP (Airtable, Close, HubSpot) and an approval path |

## Not built

- Outbound voice calls or an AI receptionist. The OS can record a missed call; it does not answer
  the phone.
- Voicemail transcription, call recording, or live transfer.
- Ad management, lead purchasing, or list scraping.
- Invoicing, payments, accounting, inventory, payroll.
- Native CRM write-back via MCP. A generic `CRM_WEBHOOK_URL` sync works; mapping to Jobber,
  HubSpot, ServiceTitan or Salesforce is the receiver's job.
- Google Business Profile review API. The OS asks for a review with a link; it does not post.
- Multi-tenant SaaS auth. Today: one tenant per deployment, Basic Auth.
- Mobile app.

Do not promise these in a demo.

## Two Hermes lanes

There are **no autonomous agents** in the customer path. The “roles” are four deterministic
voices over one kernel:

| Role | What it is | What it is not |
|---|---|---|
| Concierge | First response, booking, handoff | A separate agent with its own memory |
| Reviver | Past-customer reactivation | A separate campaign brain |
| Advocate | Reviews, referrals, proof | A review-gating bot |
| Analyst | Reports, proof, owner view | An autonomous researcher |

### Assistant lane — read-only snapshot

`/api/hermes/ask` receives revenue, bookings, pipeline, missed calls and the top six decisions.
It returns text. It cannot send, consent, book, run tools or write the log. This is the owner's
daily brief.

### Operator lane — real tools, approval boundary

`/api/operator/tasks` runs Hermes with:

- **Skills**: `prospect-research`, `social-calendar`, `social-post`, `sales-sequence`,
  `email-draft`, `crm-hygiene`, `lead-qualification`, `objection-handling`, `offer-strategy`,
  `cold-email`.
- **Tools**: web research for prospect tasks; MCP servers when configured.
- **A workspace**: `data/operator/workspace`, not the customer event log.
- **Approval**: `send_email` uses Resend only after you approve. `social_publish` uses Buffer
  (image/video assets) or `SOCIAL_WEBHOOK_URL` only after you approve. Drafts never send.

| Operator task | What it does | Approval |
|---|---|---|
| Find prospects | Web research; table with sources; no invented emails | No |
| Social calendar | 5 posts with hook/body/CTA | No |
| Sales sequence | 3-email outbound sequence | No |
| CRM audit | Duplicates, consent gaps, stale records | No |
| Send email | Draft, then send via Resend | **Yes** |
| Publish social | Draft, then post via Buffer (image/video) or social webhook | **Yes** |

This is the line: **Hermes can think and research with tools; it cannot touch a customer or a
public account without a human click.**

### MCP and skills

The ten operator skills are installed in the Hermes profile. Hermes also has the **Choice OS
MCP** (`choice-os`, 11 tools), so it can call the OS directly:

```powershell
hermes mcp test choice-os
hermes chat -t choice-os
```

See [`HERMES-MCP.md`](HERMES-MCP.md). To add a business system, install its MCP server, not a
new agent:

```powershell
hermes mcp install airtable      # CRM / ops base
hermes mcp install close         # sales CRM
hermes mcp install klaviyo       # email marketing
hermes mcp install notion        # docs / SOPs
hermes mcp install stripe        # payments / invoices
hermes mcp install monday        # Monday boards
```

Each one needs its own OAuth or API key. Start read-only; add writes only after the workflow is
tested. Social publishing uses Buffer (native image/video assets) or a webhook (n8n, Postiz,
Make) so platform credentials stay outside the OS. Do not give Hermes a browser logged into
X/LinkedIn and call it automation; that is how accounts get banned.

## Test everything

```powershell
npm test          # 84 unit/integration tests
npm run selftest  # 11 end-to-end checks with mock Twilio/Resend/Cal.diy/Stripe/CRM
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
If a provider is not connected, the OS says “skipped,” not “sent.” Operator drafts can use real
tools; operator sends and posts wait for a human approval. That is the product.
