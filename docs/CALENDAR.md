# Cal.diy / Cal.com Calendar

The OS uses the **Cal.com v2 API**, which Cal.diy implements. The same adapter works against:

- a self-hosted Cal.diy container (`http://localhost:3000`),
- a hardened Cal.diy deployment (`https://cal.yourdomain.com`),
- hosted Cal.com (`https://api.cal.com`).

## What the OS does with it

- Reads real availability for the event type.
- Passes the two soonest real slots and the real deadline into `calendar_hold`.
- Reserves a slot (`POST /v2/slots/reservations`) before claiming it is held.
- Creates a booking (`POST /v2/bookings`) when the customer confirms.

The kernel still decides **who** gets a hold and **when**. Cal.diy only supplies the times.

## Self-host Cal.diy

Cal.diy is the MIT community edition. Read its warning first: it is intended for personal,
non-production use. For a commercial pilot, harden it (TLS, backups, patched image, private
network) or use Cal.com's hosted/enterprise offering.

```bash
git clone --recursive https://github.com/calcom/cal.diy.git
cd cal.diy
cp .env.example .env
```

Generate the two required secrets:

```bash
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -base64 24   # CALENDSO_ENCRYPTION_KEY
```

Set in `.env`:

```env
NEXT_PUBLIC_WEBAPP_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000/api/auth
NEXTAUTH_SECRET=<generated>
CALENDSO_ENCRYPTION_KEY=<generated>
DATABASE_URL=postgresql://unicorn_user:magical_password@database:5432/calendso
CALCOM_TELEMETRY_DISABLED=1
```

Start the stack:

```bash
docker compose up -d
```

Open **http://localhost:3000** and complete the first-run setup:

1. Create the owner account.
2. Create an event type, e.g. **Roof Inspection**, 60 minutes.
3. Open **Settings → Developer → API keys**, create a key, copy it.
4. Copy the event type ID from the event type URL or the API.

If you want Cal.diy to write to Google/Outlook, connect it under **Settings → Integrations**.
That is separate from the Choice OS adapter; the OS only needs availability and bookings.

## Point Choice OS at it

```powershell
$env:CALCOM_BASE_URL="http://localhost:3000"
$env:CALCOM_API_KEY="cal_live_..."
$env:CALCOM_EVENT_TYPE_ID="123"
$env:CALCOM_TIMEZONE="America/Denver"
node src/cli.ts serve --host 0.0.0.0 --port 4177
```

The API key is sent as `Authorization: Bearer <key>`; the adapter also sends the required
`cal-api-version` headers.

Test it:

```powershell
$pair=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("biodynamx:ChoiceOS26!"))
Invoke-RestMethod http://127.0.0.1:4177/api/calendar/slots -Headers @{Authorization="Basic $pair"}
```

The console's **Go-live checklist** shows **Calendar holds** as ready when the three env vars
are present.

## Production notes

- Put Cal.diy behind TLS; set `NEXT_PUBLIC_WEBAPP_URL` and `NEXTAUTH_URL` to the public URL.
- Back up the Postgres volume.
- Keep the API key server-side. Never put it in the browser.
- The OS caches slots for five minutes per process to avoid hammering the calendar.
- If Cal.diy is down, the OS falls back to its deterministic demo slots. For a real pilot, treat
  a calendar outage as a blocker: do not claim a hold you cannot reserve.

## What is still missing

- Automatic booking on an inbound “book” intent. The conductor records the local booking; the
  Cal.diy `POST /v2/bookings` call is implemented but not yet fired from the webhook path.
- A calendar UI inside the console. For now, the owner uses Cal.diy directly.
- Two-way cancellation/reschedule sync.

Those are the next calendar tasks. The adapter and real deadline wiring are done.
