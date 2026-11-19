# The Operator Lane

Hermes is not only a reporter. It has a second lane with real skills and tools. The rule is
simple:

> **Drafts are free. Sends and public posts require a human click.**

## What the operator does

| Task | What Hermes does | Tools | Approval |
|---|---|---|---|
| **Find prospects** | Researches local businesses; returns a table with sources and `unknown` fields | Web | No |
| **Social calendar** | Writes 5 posts with hook, body and CTA | None | No |
| **Sales sequence** | Writes 3 emails and the send days | None | No |
| **CRM audit** | Finds duplicates, consent gaps and stale records | None | No |
| **Send email** | Writes the body, then sends via Resend | Resend | **Yes** |
| **Publish social** | Writes the post, then sends to Buffer (image/video) or a webhook | Buffer / webhook | **Yes** |

The operator runs in `data/operator/workspace`, not the customer event log. It receives the
business context (name, trade, city, owner, ticket), not the contact list.

## In the console

Open the **Operator** tab:

1. Pick a task type.
2. Write the brief.
3. Press **Run task**.
4. Read the draft. Approve, reject, or edit by running a new task.

A send task lands in `needs_approval`; nothing leaves the building until you press **Approve &
send**. If Resend or the social webhook is not configured, approval returns an error instead of
pretending it sent.

## API

```http
GET  /api/operator/status
GET  /api/operator/tasks
POST /api/operator/tasks          { "type": "social_calendar", "prompt": "..." }
GET  /api/operator/tasks/:id
POST /api/operator/tasks/:id/approve
POST /api/operator/tasks/:id/reject
```

For `send_email`, include `to` and `subject`:

```json
{
  "type": "send_email",
  "to": "owner@example.com",
  "subject": "The calls you missed",
  "prompt": "Write a 90-word email to a roofing owner about missed calls. No invented numbers."
}
```

For `social_publish`, include `platforms`:

```json
{
  "type": "social_publish",
  "platforms": ["facebook", "instagram"],
  "prompt": "Write one post about the hail season inspection offer. No fake urgency."
}
```

## Skills

Installed in the Hermes profile:

- `prospect-research`
- `social-calendar`
- `social-post`
- `sales-sequence`
- `email-draft`
- `crm-hygiene`
- `lead-qualification` (BANT + ICP scoring, adapted from Sellbird)
- `objection-handling` (LAARC)
- `offer-strategy`
- `cold-email` (compliant, plain-text outbound)

The source is in [`.hermes/skills/`](../.hermes/skills). To add one, create a `SKILL.md` with
`name` and `description` frontmatter, copy it into the active Hermes profile's `skills/`
directory, and select it in `src/operator/runner.ts`.

## Tools and MCP

For research, the operator enables the `web` toolset. For business systems, install MCP servers:

```powershell
hermes mcp install airtable      # CRM, ops base
hermes mcp install close         # sales CRM
hermes mcp install klaviyo       # email marketing
hermes mcp install notion        # SOPs and docs
hermes mcp install stripe        # payments and invoices
```

Each needs OAuth or an API key. Start read-only; add writes after the workflow is tested.

### Social

Buffer is the preferred scheduler. Set:

```env
BUFFER_API_KEY=...
BUFFER_ORGANIZATION_ID=...
BUFFER_CHANNEL_IDS=ch_1,ch_2
BUFFER_SHARE_MODE=addToQueue
```

The adapter uses Buffer's GraphQL `createPost`, with `assets: [{ image: { url } }]` or
`assets: [{ video: { url, thumbnailUrl } }]`. The Operator form accepts an image URL, a video
URL, an optional thumbnail and alt text.

If Buffer is not configured, the approved post goes to `SOCIAL_WEBHOOK_URL` (n8n, Make,
Postiz).

### Media

A local file is not a public URL. Put the rendered image/video on the public media route:

```powershell
npm run media-add -- --file .\renders\roof.mp4
```

Paste the returned URL into the social task. It serves from `data/media` with an unguessable
token, no Basic Auth, and an immutable cache header. Supported: jpg, png, webp, gif, mp4, mov,
webm.

## Models

- Assistant: `meta-llama/llama-3.3-70b-instruct:free` (OpenRouter), fallback local Ollama
  `nemotron-3.5-lightning:30b-a3b`.
- Operator: `qwen/qwen3-235b-a22b:free` (OpenRouter), fallback local Ollama.

All free. Set `OPERATOR_MODEL` / `OPERATOR_PROVIDER` to change the operator without touching the
assistant.

## Honest limits

- The free models are not as good as a frontier model. Read the draft; the approval screen is
  there for a reason.
- Prospect research is only as good as the public web. It will write `unknown` rather than
  invent an email. Verify before you call.
- Social publishing needs a scheduler/webhook. The OS does not hold X/LinkedIn credentials.
- CRM writes need an MCP server and an approval workflow. The current CRM task is an audit, not
  a write.
- There is still one tenant per deployment; this is not a multi-tenant SaaS yet.
