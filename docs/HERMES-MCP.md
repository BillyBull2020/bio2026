# Hermes ↔ Choice OS MCP

Hermes now has the OS as an MCP server. It can read the business and call the same tools the
console uses — not a parallel implementation.

## Registered server

```
Name:      choice-os
Transport: stdio → node src/mcp/server.ts
Tools:     11
```

Verify:

```powershell
hermes mcp test choice-os
hermes mcp list
```

## Tools

| Tool | What it does |
|---|---|
| `business_snapshot` | Revenue, bookings, pipeline, missed calls, reviews, top queue |
| `create_operator_task` | Runs a Hermes operator task |
| `list_operator_tasks` | Task status |
| `approve_operator_task` | Approves a send/publish task (requires `CHOICE_OS_MCP_ALLOW_APPROVE=1`) |
| `send_email` | Drafts and sends via Resend (queues for approval by default) |
| `publish_social` | Drafts and publishes via Buffer (image/video) or webhook |
| `stripe_checkout` | Creates a Stripe Checkout URL |
| `crm_sync` | Posts the book to the CRM webhook |
| `calendar_slots` | Reads Cal.diy/Cal.com availability |
| `buffer_channels` | Lists Buffer channel IDs |
| `media_add` | Copies a local image/video to the public media route |

## Use it in Hermes

The `choice-os` toolset must be selected explicitly:

```powershell
hermes chat -t choice-os
```

Or one-shot:

```powershell
hermes chat -q "Use business_snapshot. What is the tenant, revenue recovered, and top queue contact?" `
  --oneshot -Q --format text `
  --provider openrouter -m meta-llama/llama-3.3-70b-instruct:free `
  -t choice-os --yolo --max-turns 4
```

That call was tested and returned the real Summit Ridge queue.

## Approval

Default: Hermes can research, draft, create tasks and read the business. It **cannot** approve its
own sends.

```env
CHOICE_OS_MCP_ALLOW_APPROVE=0   # default
```

If you want Hermes to send/publish autonomously, set `CHOICE_OS_MCP_ALLOW_APPROVE=1` in the MCP
server environment and restart Hermes. That is a real autonomy switch; turn it on only for a
trusted operator profile.

## Media

Hermes can call `media_add` with a local path:

```
media_add({ "file": "C:\\renders\\roof.mp4" })
```

It returns the public URL to pass to `publish_social`. The file is copied into `data/media` with
an unguessable token; no platform credential is involved.

## Security

The MCP server reads `CHOICE_OS_URL`, `CHOICE_OS_USER`, `CHOICE_OS_PASS` from its Hermes config.
That password is local, not committed. The server exposes only the Choice OS tools; it does not
give Hermes a shell or the event log.

Do not enable `CHOICE_OS_MCP_ALLOW_APPROVE=1` until you have run the real Twilio/Resend/Buffer
tests and are comfortable with the audit trail.
