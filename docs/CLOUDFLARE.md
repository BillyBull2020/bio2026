# Put Choice OS online at `os.biodynamx.com`

## The short answer

Yes — but not as a page inside the existing Firebase Hosting site. Choice OS is a **Node
service** with an API, SSE stream and a durable event log. Firebase Hosting serves static
files; it cannot run this kernel.

The clean shape is:

```
biodynamx.com            → existing marketing site (Firebase)
os.biodynamx.com         → Choice OS (Cloudflare Tunnel or container host)
```

The DNS for `biodynamx.com` is already on Cloudflare (`leonidas.ns.cloudflare.com`,
`savanna.ns.cloudflare.com`), so a subdomain can be added without moving the main site.

---

## Option A — Cloudflare Tunnel (fastest, no new host)

This keeps the kernel on this machine and gives it a real hostname with TLS.

### 1. Authorize Cloudflare once

```powershell
cloudflared tunnel login
```

A browser opens. Pick the `biodynamx.com` zone and authorize. This writes
`%USERPROFILE%\.cloudflared\cert.pem`.

Without this step, only a temporary `*.trycloudflare.com` URL is possible. That is what is
running now for the demo; it is not permanent.

### 2. Create the tunnel and the DNS record

```powershell
cloudflared tunnel create biodynamx-os
cloudflared tunnel route dns biodynamx-os os.biodynamx.com
```

### 3. Point it at the kernel

Create `%USERPROFILE%\.cloudflared\config.yml`:

```yaml
tunnel: biodynamx-os
credentials-file: C:\Users\billy\.cloudflared\<tunnel-id>.json

ingress:
  - hostname: os.biodynamx.com
    service: http://127.0.0.1:4177
  - service: http_status:404
```

### 4. Run it

```powershell
cloudflared tunnel run biodynamx-os
```

For an always-on service:

```powershell
cloudflared service install
```

### 5. Protect it before exposing it

The kernel must have Basic Auth on:

```powershell
$env:CHOICE_CONSOLE_USER="biodynamx"
$env:CHOICE_CONSOLE_PASS="use-a-long-random-password"
node src/cli.ts serve --host 127.0.0.1 --port 4177
```

`/api/health` stays public for monitoring. Everything else returns 401 without the password.
Do not create the DNS record before auth is on.

---

## Option B — Container host

The repo includes a `Dockerfile`. Deploy it to any always-on host with a persistent volume
(Fly.io, Render, Railway, a small VM):

```bash
docker build -t biodynamx/choice-os .
docker run -p 4177:4177 -v choice-data:/app/data \
  -e CHOICE_CONSOLE_USER=biodynamx \
  -e CHOICE_CONSOLE_PASS=... \
  biodynamx/choice-os
```

Then add a CNAME in Cloudflare:

```
os  →  your-host.example.com
```

Use a **proxied** CNAME if the host supports it, or an A/AAAA record to the host IP.

### Important persistence caveat

The current store is a single `data/events.jsonl` file. It is fine for one business and one
process. It is **not** multi-tenant and not safe for concurrent writers. Before selling this
to multiple clients:

- move events to Postgres (one row per event, tenant_id),
- put the kernel behind one service instance per tenant, or add row-level security,
- replace the in-process scheduler tick with a queue worker.

That is a two-to-three day change, not a rewrite. The reducer and scheduler stay.

---

## What is already wired vs. what needs credentials

| Capability | Status | What is missing |
|---|---|---|
| Kernel API (`/api/state`, `/api/business`, `/plan`, `/send`, `/reply`, `/tick`, `/run-day`, `/events`, `/simulate`, `/reload`) | **Working** | Nothing — 52 tests, including an endpoint-surface test |
| Console + SSE | **Working** | Nothing |
| Basic Auth | **Working** | Set `CHOICE_CONSOLE_USER` / `CHOICE_CONSOLE_PASS` |
| Cloudflare quick tunnel | **Working now** | Ephemeral URL only |
| `os.biodynamx.com` | **One authorization away** | `cloudflared tunnel login` or a scoped Cloudflare token |
| Twilio voice/SMS | **Adapter only** | Account SID, auth token, number. Point `CHOICE_WEBHOOK_URL` at a small worker or wire the Twilio SDK |
| Resend email | **Adapter only** | API key and verified domain |
| Calendar holds | **Not connected** | Google/Outlook calendar credentials. `calendar_hold` is blocked until real slots exist |
| LLM rewrite layer | **Optional, off** | `CHOICE_LLM_BASE_URL`, key, model. The kernel works without it |
| Billing / Stripe | **Not in this repo** | Stripe keys and products |
| Multi-tenant auth | **Not built** | Postgres + tenant-aware sessions |

The console reports `delivery: false` right now. That means **Send logs the action but does
not deliver it**. This is the honest demo state, not a bug.

---

## The go-live checklist

- [ ] `cloudflared tunnel login` and DNS route for `os.biodynamx.com`
- [ ] `CHOICE_CONSOLE_USER` / `CHOICE_CONSOLE_PASS` set
- [ ] Twilio number purchased and webhook pointed at the delivery worker
- [ ] Resend domain verified
- [ ] Calendar OAuth completed and two real slots available
- [ ] Consented customer list imported
- [ ] Claims registry populated for every number the copy uses
- [ ] Shadow mode run for two weeks
- [ ] Four-week holdout with a pre-registered primary metric
- [ ] Event log backed up; one process owns the data directory
