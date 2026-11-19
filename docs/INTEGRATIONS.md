# Integrations: What Is Wired, What You Supply

The OS is code-complete for the pilot loop. The only missing pieces are accounts and keys.
Nothing is faked: if a provider is absent, the endpoint returns `skipped` or **400**, not
“sent.”

## The board

| Integration | Code | What you supply | Test |
|---|---|---|---|
| **Twilio SMS** | `src/tools/delivery.ts` | Account SID, auth token, from number, 10DLC | `npm run selftest`; then one SMS to your phone |
| **Twilio inbound** | `/webhooks/twilio` | Webhook URL + `CHOICE_PUBLIC_URL` | Reply STOP; contact opts out |
| **Resend email** | `src/tools/delivery.ts` | API key, verified from address | One email to your inbox |
| **Cal.diy / Cal.com** | `src/tools/calendar.ts` | Base URL, API key, event type ID | `GET /api/calendar/slots` |
| **Stripe** | `src/tools/stripe.ts` | Secret key + recurring price ID | `POST /api/billing/checkout` |
| **Social publish** | `src/tools/social.ts` | `SOCIAL_WEBHOOK_URL` (n8n, Make, Postiz, Buffer) | Approve a `social_publish` task |
| **CRM sync** | `src/tools/crm.ts` | `CRM_WEBHOOK_URL` (n8n, Make, Zapier, Airtable Automations) | `POST /api/crm/sync` |
| **Hermes operator** | `src/operator/` | Hermes + Ollama/OpenRouter | `GET /api/operator/status` |
| **Hermes MCPs** | Hermes config | OAuth/keys per server | `hermes mcp list` |

## Environment

Copy `.env.example`; the relevant names:

```env
# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=
# or TWILIO_MESSAGING_SERVICE_SID=

# Resend
RESEND_API_KEY=
RESEND_FROM=

# Cal.diy / Cal.com
CALCOM_BASE_URL=http://localhost:3000
CALCOM_API_KEY=
CALCOM_EVENT_TYPE_ID=
CALCOM_TIMEZONE=America/Denver

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=

# Social scheduler
SOCIAL_WEBHOOK_URL=
SOCIAL_WEBHOOK_TOKEN=

# CRM automation
CRM_WEBHOOK_URL=
CRM_WEBHOOK_TOKEN=

# Free models
HERMES_PROVIDER=openrouter
HERMES_MODEL=meta-llama/llama-3.3-70b-instruct:free
HERMES_FALLBACK_PROVIDER=ollama
HERMES_FALLBACK_MODEL=nemotron-3.5-lightning:30b-a3b
OPERATOR_MODEL=qwen/qwen3-235b-a22b:free
```

## Social, specifically

The OS does not hold X/LinkedIn/Meta credentials. It sends an approved post to a webhook:

```json
{
  "text": "The post text.",
  "platforms": ["facebook", "instagram"],
  "approved": true
}
```

Point it at n8n/Make/Postiz/Buffer. That is the safe way to publish: platform credentials stay
in the scheduler, not in a model or a public repo.

## CRM, specifically

`POST /api/crm/sync` sends:

```json
{
  "tenant": "Acme Roofing",
  "contacts": [{ "id": "...", "firstName": "...", "phone": "...", "email": "...", "stage": "..." }],
  "bookings": [{ "id": "...", "contactId": "...", "slot": "...", "value": 12000, "status": "..." }]
}
```

The receiver maps it to Jobber, HubSpot, Airtable, ServiceTitan, or a Google Sheet. The OS does
not try to guess your CRM's schema.

## Stripe, specifically

The OS creates a **subscription Checkout Session**:

```http
POST /api/billing/checkout
{ "email": "owner@example.com" }
```

It returns a Stripe-hosted URL. No card data touches the OS. If `STRIPE_SECRET_KEY` or
`STRIPE_PRICE_ID` is missing, the endpoint returns **400**.

## Test order

1. `npm test` — 77 tests.
2. `npm run selftest` — 11 end-to-end checks with mock providers.
3. `GET /api/setup/status` — nine-item go-live checklist.
4. One real SMS to your phone; reply STOP.
5. One real email to your inbox.
6. One Cal.diy slot, reservation and booking.
7. One Stripe test-mode checkout.
8. One Operator research task and one `send_email` approval.
9. One social post to a test webhook.

## What is still not wired

- Outbound voice / AI receptionist.
- Inbound email parsing.
- Two-way calendar reschedule/cancel.
- Ads, accounting, payroll, inventory.
- Multi-tenant auth (one tenant per deployment today).

Those are real gaps. Do not demo them as working.
