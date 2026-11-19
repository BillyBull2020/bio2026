# Hermes: the read-only operations analyst

## What Hermes is doing here

Hermes is the owner's **chief of staff**, not a second decision engine.

It reads a compact snapshot of the business and writes:

- today's focus,
- a weekly owner report,
- the at-risk contacts and why,
- the highest-value action, and what to ignore.

That is genuinely useful. Running a business is not only sending messages; it is deciding
where to spend the next hour, which customer is about to churn, and what the week actually
looked like.

## The boundary

```
Choice OS kernel                         Hermes
─────────────────                        ──────
signals → field → scheduler              reads a compact snapshot
        → policy → action/wait           writes plain text
        → event log                      cannot send, consent, book or log
```

Hermes receives **no contact list**, no phone numbers, no email addresses and no write access.
It gets aggregated numbers plus the top six decisions:

```json
{
  "tenant": "Summit Ridge Roofing",
  "revenueRecovered": 14500,
  "jobsBooked": 1,
  "pipelineValue": 33241,
  "missedCalls": 85,
  "actionsToday": 8,
  "openReviews": 1,
  "top": [
    { "name": "Tom Becker", "situation": "trust", "move": "Confirm and reassure", "value": 14500, "readiness": 0.56, "blocked": false }
  ]
}
```

It returns text. The console displays it. Nothing is executed.

## Why it runs with tools disabled

Hermes is a full agent. In testing, a prompt that looked like a simple answer triggered a
tool call and wrote a skill file. That is unacceptable inside a business console.

The integration therefore runs:

```text
hermes chat -q <prompt> --oneshot -Q --format text --max-turns 1
```

- **No toolsets** — no browser, terminal, file, code execution, skills, memory or delegation.
- **One turn** — no tool loop, no approval prompt, no surprise side effect.
- **Quiet format** — the final text only.
- **Timeout** — 90 seconds, then the process is killed and the console shows a clean error.

The result is a reliable analyst, not an unpredictable operator.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `HERMES_BIN` | `C:\Users\billy\AppData\Local\hermes\bin\hermes.exe` | Absolute path to the CLI |
| `HERMES_PROVIDER` | `openrouter` | Free model route |
| `HERMES_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` | A `:free` model id |
| `HERMES_FALLBACK_PROVIDER` | `ollama` | Local fallback |
| `HERMES_FALLBACK_MODEL` | `nemotron-3.5-lightning:30b-a3b` | Installed Ollama model |

No paid API is required. The primary route is a free OpenRouter model; if it is unavailable,
the client retries the local Ollama model. A model is only accepted if it is free; do not put a
paid model in `HERMES_MODEL`.

Change the model without touching code:

```powershell
$env:HERMES_PROVIDER="openrouter"
$env:HERMES_MODEL="meta-llama/llama-3.3-70b-instruct:free"
$env:HERMES_FALLBACK_PROVIDER="ollama"
$env:HERMES_FALLBACK_MODEL="nemotron-3.5-lightning:30b-a3b"
node src/cli.ts serve --host 0.0.0.0 --port 4177
```

Hermes must be installed and authenticated separately (`hermes status`, `hermes setup`).
Ollama must be running with the fallback model pulled. The OS degrades gracefully if both are
missing: the console shows **not installed** and the rest of the system works.

## API

```http
GET  /api/hermes/status
POST /api/hermes/ask   { "prompt": "What should I focus on today?" }
```

Response:

```json
{
  "ok": true,
  "text": "...",
  "model": "meta-llama/llama-3.3-70b-instruct:free",
  "provider": "openrouter",
  "durationMs": 8421
}
```

If the model is unavailable, `ok` is false and `error` explains why. The console shows the
error; it never falls back to inventing an answer.

## Example questions

- “What should I focus on today?”
- “Write a concise weekly owner report from this snapshot.”
- “Which contacts are at risk, and why? What should I do about the top one?”
- “What is the single highest-value action this week, and what should I ignore?”
- “Explain the three phases to a new office manager in plain English.”

## What Hermes cannot do

- Send an SMS, email or voice message.
- Change consent, opt anyone out, or book a job.
- Add, edit or delete a contact.
- Write to the event log.
- Read phone numbers, emails or message bodies.
- Execute code, browse, or call MCP tools **in this integration**.

Those restrictions are deliberate. If you later want Hermes to do research with the web
tool, give it a separate, approval-gated tool with a read-only allowlist — not the send path.

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `not installed` | Bad `HERMES_BIN` | Point it at `hermes.exe` |
| `No reply: every provider...` | Model/provider unavailable | Switch `HERMES_MODEL` / `HERMES_PROVIDER` |
| Timeout | Model slow or prompt too large | Shorten the question; retry |
| Empty response | Hermes printed only a tool call | Keep tools disabled; one turn |

The snapshot is small by design. If Hermes needs more context, add a field to the snapshot —
not the contact list.
