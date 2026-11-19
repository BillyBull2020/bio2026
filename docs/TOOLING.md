# Tooling decision: what to use, and what not to

## The rule

> **One brain, many hands.**
>
> The kernel is the only place that decides who to contact, when, with which move, and under
> which policy. Everything else is a tool that returns data or performs an approved action.
> A second orchestrator is not an integration; it is a regression.

This is the test every tool has to pass:

1. Can it be called with a typed input and return a typed output?
2. Can it be denied by role and by policy?
3. Does it avoid owning memory, scheduling or consent?
4. If it disappears tomorrow, does the kernel still run?

If the answer to 3 is no, it is not a tool. It is a competing brain.

---

## Verdict

| System | Use it? | Where it fits | What it must never do |
|---|---|---|---|
| **DeepSeek Harness** | **Yes** | Build, test, operate, audit this repo. The engineering runtime. | Become a runtime dependency of the product. |
| **Sellbird** | **Yes, narrowly** | Top-of-funnel discovery and enrichment. Export a CSV; import it as **zero-consent** prospects. | Send. Own the sequence. Embed its AGPL code in the proprietary kernel. |
| **HyperFrames** | **Yes** | Analyst proof assets: a 10-second revenue-leak or case-study video. | Invent a claim. A rendered video is a claim *candidate* until a human verifies it. |
| **nginx** | **Yes** | Reverse proxy, TLS, basic auth in front of the console. | — |
| **Firebase / Cloudflare** | **Yes** | Hosting the site, the console, or the event store. | Host the scheduler in a request-scoped function without durable state. |
| **Hermes** | **Yes, read-only** | The operator's chief of staff: daily focus, weekly owner report, at-risk list, research summary. It receives a compact snapshot and returns text. | Send, choose moves, write the event log, change consent, or receive the full contact list. Run it with tools disabled. |
| **OpenClaw** | **No, not in the decision path** | Optional isolated MCP/tool bridge for research. | Receive the contact list, choose moves, or write to the event log. |
| **OpenMausBot** | **No** | At most a demo interface or a local operator chat. | Be a second roster of agents with its own memory and tools. |
| **Mautic** | **No, not as the campaign brain** | At most SMTP/segment transport behind a delivery adapter. | Own consent, scheduling, or journey logic. |
| **Jarvis / Jenny** | **Later, optional** | A voice console for the operator ("what should I do about Dana?"). | Talk to customers without the kernel. |
| **LiveAvatar** | **Later, optional** | A delivery surface for proof or reception. | Decide what to say. |
| **Mole** | **No** | Unrelated system maintenance. | — |

---

## Why Hermes is read-only

Hermes is a capable agent with its own memory, tools, skills and loop. That is exactly why it
does **not** get the contact list or the send button.

In Choice OS, Hermes receives a compact, read-only snapshot of the business — revenue,
bookings, pipeline, missed calls, the top six decisions — and a question. It returns text.
It cannot send, change consent, book a job, or write to the event log. The kernel remains the
only place that decides.

That gives the owner a real chief of staff (daily focus, weekly report, risk list, research
summary) without creating a second brain that disagrees with the first. See
[`HERMES.md`](HERMES.md) for the exact boundary and configuration.

OpenMausBot and Mautic remain outside the decision path for the same reason: they are
competing brains, not tools.

Use these systems for what they are good at — a local chat surface, a browser worker, a
research assistant — behind a typed adapter, with no write access to the log.

---

## Sellbird: discovery, not outreach

Sellbird's export is a prospect list: `email`, `first_name`, `last_name`, `company_name`,
`title`, `website`, `industry`, `personalization`, `email_status`, `score`, `seniority`,
`source`, `status`, `created_at`.

That is useful. What it does **not** contain is consent. A cold prospect is not a customer
who asked to hear from you. Importing a Sellbird list directly into an outbound sequencer is
how businesses end up with TCPA complaints and a burned domain.

The importer therefore does the opposite of what a growth tool expects:

```bash
node src/cli.ts import-sellbird --file prospects.csv
```

It creates contacts with:

- **no marketing consent** (any channel),
- **pressure budget 0**,
- tags `sellbird`, `needs_consent`, and the industry,
- a note with title, website and the Sellbird personalization line.

The scheduler will return `wait` for every one of them until a human records a lawful basis.
That is not a bug; it is the compliance boundary. Use Sellbird to *find* the account and the
person. Use the kernel to decide whether there is a legitimate reason to talk, and let a
human record it.

**Licensing:** Sellbird is AGPL-3.0. Do not copy its code into the proprietary kernel. Call
it as an external process or consume its exported file. The adapter in this repo parses the
CSV only.

---

## HyperFrames: proof, not persuasion

The `Analyst` role can queue a proof video:

```bash
node src/cli.ts proof-video --contact <id> --out data/proofs
```

This writes a manifest:

```json
{
  "tool": "hyperframes",
  "durationSeconds": 10,
  "scene": "revenue-leak",
  "script": "Open on a phone ringing unanswered. Cut to a calendar with 11 empty slots...",
  "claimIds": ["claim_missed_call_value"],
  "status": "queued"
}
```

HyperFrames renders it. The kernel does not wait for the render, and the video does not
change the decision field. When a human verifies the numbers, the video becomes a **proof
asset** attached to the claim — which is what makes it usable in `local_proof`.

Do not let a generated video introduce a number that is not in the claim registry. The same
claim-trace rule applies to pixels.

---

## DeepSeek Harness: the workbench

DSH is how this repository was built, tested and audited. Use it for:

- running the test suite and the simulation matrix,
- reverse-engineering the existing site and repo,
- generating migration diffs,
- operating the console during a pilot,
- writing the weekly evidence report.

Do not make the product depend on DSH at runtime. The kernel runs on plain Node with zero
dependencies; that is a feature for a system that has to survive a vendor change.

---

## The integration contract

Every tool implements:

```ts
interface ToolDefinition<I, O> {
  id: string;
  permission: "read" | "write" | "send";
  roles: string[];                 // analyst, advocate, human, …
  run(input: I, ctx: ToolContext): Promise<ToolResult<O>>;
}
```

- `run` returns data and, optionally, **proposed events**. The kernel validates and emits
  them; the tool never writes the log directly.
- `permission: "send"` is never granted to a tool that is available to an autonomous role
  without human approval.
- `roles` is an allowlist, not a hint. `roleCanUseTool` is enforced at the call site.
- A tool that fails returns `{ ok: false, error }`. It does not throw into the scheduler.

---

## What to adopt next, in order

1. **A real delivery adapter** (Twilio + Resend) behind `send`. This is the shortest path to
   field data.
2. **A calendar adapter** that creates real holds. `calendar_hold` is blocked until it does.
3. **A website/GMB audit tool** (browser worker or API) that writes findings as claims, not
   as prose. This is where OpenMausBot or a headless browser could live — isolated, read-only.
4. **HyperFrames proof assets** for the top three objections.
5. **A voice console** (Jarvis/Jenny) for the operator, read-only over the event log.
6. **Only then** consider a model rewrite layer. It is optional; the policy gate is not.

Anything that wants to own memory, scheduling or consent is not a tool. Say no.
