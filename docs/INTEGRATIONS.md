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
| **Social publish** | `src/tools/buffer.ts` / `social.ts` | Buffer API key + channel IDs, or `SOCIAL_WEBHOOK_URL` | Approve a `social_publish` task |
| **Media URLs** | `src/tools/media.ts` | A public `CHOICE_PUBLIC_URL` | `npm run media-add -- --file image.png` |
| **CRM sync** | `src/tools/crm.ts` | `CRM_WEBHOOK_URL` (n8n, Make, Zapier, Airtable Automations) | `POST /api/crm/sync` |
| **Monday CRM** | Hermes MCP | Accept your invite, then `hermes mcp install monday` + OAuth | `hermes mcp list` |
| **Hermes operator** | `src/operator/` | Hermes + Ollama/OpenRouter | `GET /api/operator/status` |
| **Choice OS MCP** | `src/mcp/server.ts` | Hermes MCP client | `hermes mcp test choice-os` |
| **Sellbird** | external Python app | Run it separately; `sellbird export` CSV | `node src/cli.ts import-sellbird --file ...` |
| **HyperFrames** | `HyperFramesApp` | Render a proof image/video | `proof-video` manifest → `media-add` |
| **OpenMausBot** | `C:\Users\billy\OpenMausBot` | Chat UI only; not in customer path | `scripts/mcp-server.ts` if you want a UI bridge |
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
BUFFER_API_KEY=
BUFFER_ORGANIZATION_ID=
BUFFER_CHANNEL_IDS=
BUFFER_SHARE_MODE=addToQueue
# or:
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
OPERATOR_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

## Social, specifically

The OS prefers **Buffer native** when `BUFFER_API_KEY` is set. It uses the same GraphQL
`createPost` mutation as Buffer's official n8n node, including image and video assets:

```json
{
  "text": "The post text.",
  "assets": [{ "video": { "url": "https://.../roof.mp4", "thumbnailUrl": "https://.../roof.jpg" } }]
}
```

Set `BUFFER_CHANNEL_IDS` to the comma-separated channel IDs (from Buffer's channel list). If
Buffer is not configured, an approved post goes to `SOCIAL_WEBHOOK_URL` (n8n/Make/Postiz).

### Images and videos

Buffer and social platforms need a public URL, not a local file. Put the generated asset on the
public media route:

```powershell
npm run media-add -- --file .\renders\roof.mp4
```

It returns an unguessable URL such as:

```text
https://biodynamx-1.tail897ca3.ts.net:8443/media/<32-hex>.mp4
```

Paste that into the Operator **Publish social** task. The route serves `data/media` without
Basic Auth, with an unguessable token and an immutable cache header. Supported: jpg, png, webp,
gif, mp4, mov, webm.

This is how you connect the local video/image repos: render the asset, `media-add`, then attach
it to the approved Buffer post.

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

## Monday

I did **not** use the invitation token. An invite link is a one-time credential; accept it
yourself, then connect Monday as an MCP server:

```powershell
hermes mcp install monday
```

Hermes will open the OAuth flow. Once connected, the Operator can read boards and items and,
after approval, create or update records. Do not paste the invitation token into a repo, a
prompt, or this console.

## Sellbird, HyperFrames, MausBot

### Sellbird — discovery, not the decision brain

Sellbird is a full outreach platform (AGPL). Do not embed its code in Choice OS. Run it as a
separate service and take its output:

```powershell
sellbird dashboard      # local UI
sellbird run            # heartbeat, if you want it to prospect/send
sellbird export         # sequencer-ready CSV
node src/cli.ts import-sellbird --file .\sellbird\exports\prospects.csv
```

Choice OS imports the CSV as **zero-consent prospects**; the scheduler waits. That is the
correct boundary for B2B discovery. Sellbird can also expose a **read-only MCP** to a coding
agent (`sellbird mcp install --print`); its agent token can read pipeline, prospects, outbox
and usage, but cannot send or approve. Use it to let Hermes see the top of funnel, not to give
Hermes a second send engine.

### HyperFrames — media, not an agent

HyperFrames renders proof images and short videos. Use the existing proof manifest:

```powershell
node src/cli.ts proof-video --contact <id>
```

Render the manifest in HyperFrames, then publish the asset:

```powershell
npm run media-add -- --file .\renders\proof.mp4
```

Paste the returned URL into the Operator **Publish social** task. Buffer receives it as a
`video` asset. HyperFrames does not decide who to contact or what to claim.

### OpenMausBot / MausBot — UI only

OpenMausBot is a local chat app where each sidebar bot is a Claude/Codex agent. It has its own
memory, tools and MCP server (`scripts/mcp-server.ts`). That is a **second roster of agents**.

Use it, if you want, as a chat front-end. Do not give it the customer list, the send path or the
event log. If it is running, its MCP can be added to Hermes; otherwise leave it out of the
revenue path. It is not running on this machine right now.

### Mautic

Mautic is an email marketing platform. Choice OS already has Resend for transactional and
approved email. Mautic would duplicate consent, segments and journey logic. At most, use it as
SMTP/segment transport behind a delivery adapter — never as the campaign brain.

## Test order

1. `npm test` — 80 tests.
2. `npm run selftest` — 11 end-to-end checks with mock providers.
3. `GET /api/setup/status` — ten-item go-live checklist.
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
