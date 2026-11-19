# Migration: from 14 agents to one kernel

## What is actually deployed today

The public site and the `BillyBull2020/biodynamx` repository contain:

- **14+ named personas** (Jenny, Mark, Aria, Sarah, Chase, Bella, Derek, Ava, Nova, Iris,
  Alex, Zara, Megan, Vicki, Ben, Titan, Comment Scout, Jules, Rex, Atlas, Scout…).
- **Four orchestration layers** that do not know about each other:
  `MasterOrchestrator`, `TeamOrchestrator`, `IronClaw`, and `clones/agent-factory`.
- **Keyword routing**: `master-orchestrator.ts` decides who handles a message by scanning
  for "pricing", "review", "audit", etc.
- **In-memory learning**: `learningStore` and `performanceStore` are process-local maps.
- **A safety layer** (`agent-safety.ts`) that lints output, but is not a gate on *whether*
  an action is allowed, and is not part of the send path for every channel.
- **A large knowledge blob** (`agent-knowledge.ts`, ~65 KB) and a tool registry
  (`agent-toolkit.ts`, ~64 KB) shared by copy-paste rather than by a kernel.

That is the actual problem. The personas are a symptom.

---

## Persona map

Personas do not disappear; they become **voice skins** and **role presets**. A skin changes
tone. A role changes permissions. Neither changes the strategy.

| Legacy persona | What they were doing | New role | Skin | What survives |
|---|---|---|---|---|
| **Aria / Bella / Meghan** | Reception, first response | Concierge | Warm | Voice, warmth, first-turn disclosure |
| **Derek / Megan** | After-hours answering | Concierge | Warm | Channel coverage, booking |
| **Jenny** | Diagnostic / Challenger "teach" | Reviver | Direct | Loss quantification, reframe — now claim-gated |
| **Mark** | ROI bridge / close | Reviver | Direct | Objection answer, calendar hold |
| **Chase** | Outbound SDR | Reviver | Direct | Reactivation sequencing |
| **Vicki** | Reviews / reputation | Advocate | Premium | Review request, no gating |
| **Alex / Iris** | Social / content | Advocate | Premium | Post-job loop, content as proof |
| **Nova / Ava** | SEO / ads | Analyst | Clinical | Audits and claims — not outbound |
| **Zara** | Bookkeeping | — | — | Out of scope; keep as a separate product |
| **Ben / Titan / Jules** | Strategy / GM | Conductor (human) | Premium | Human approval, portfolio review |
| **Comment Scout / Rex / Atlas / Scout** | Monitoring / HR / lead hunting | Analyst or Concierge | Clinical | Tool jobs, not personas |

**The rule:** if two personas differ only in tone, they are one role with two skins. If they
differ in what they are *allowed to do*, they are two roles. Almost none of the 14 met that
bar.

---

## Code disposition

| File | Size | Disposition |
|---|---:|---|
| `src/lib/master-orchestrator.ts` | 23 KB | **Delete.** Keyword routing replaced by `kernel/scheduler.ts`. |
| `src/lib/TeamOrchestrator.ts` | 20 KB | **Delete.** Handoff sequence becomes stage + role. |
| `src/lib/ironclaw-core.ts` | 43 KB | **Port selectively.** Keep any real tool calls; drop the persona framing. |
| `src/clones/agent-factory.ts` | 50 KB | **Replace** with `roles/registry.ts` (≈120 lines). |
| `src/lib/agent-knowledge.ts` | 65 KB | **Split** into claims (`kernel/claims.ts`) and move copy (`render/renderer.ts`). |
| `src/lib/agent-toolkit.ts` | 64 KB | **Keep as adapters**, but the kernel must call them through a typed tool interface. |
| `src/lib/agent-safety.ts` | 12 KB | **Replace** with `kernel/policy.ts`; port any useful PII patterns. |
| `src/lib/agent-memory.ts` | 15 KB | **Replace** with the event log + contact field. |
| `src/lib/agent-persistence.ts` | 9 KB | **Replace** with replay; keep as an export adapter if needed. |
| `src/lib/agent-observability.ts` | 13 KB | **Keep**, wire to the event log. |
| `src/lib/gemini-live.ts` | 139 KB | **Keep as transport** for voice; the kernel decides *what* to say, not the audio pipeline. |
| `src/lib/a2a-context.ts` | 10 KB | **Keep** if agent-to-agent messaging is still a product; otherwise retire. |
| `src/lib/lead-scoring.ts` | 8 KB | **Replace** with `readiness()`. |
| `src/lib/behavior-intel.ts` | 15 KB | **Feed as signals** into `signal.recorded`. |
| Twilio / Stripe / Supabase clients | — | **Keep.** They are delivery and persistence, not the brain. |

Nothing in the migration requires throwing away the Next.js site, the voice pipeline, or the
payment stack. It requires **one path for decisions**.

---

## Rollout in five steps

### 1. Freeze the roster (day 0)

No new personas. No new orchestrator. Put a banner in the repo README: "new agents require a
role, a move, a guard and a test." This is the cheapest and most important step.

### 2. Shadow mode (week 1)

Run the kernel read-only against the existing book. For every contact the current system
would touch, compute:

- the binding constraint,
- the OS move and message,
- the policy verdict.

Log both. Do **not** send the OS message. Compare: where would the OS have waited? Where
would it have refused? Where did it choose a different move? This produces the first honest
evidence and the first list of claims that do not exist yet.

### 3. Claims first (week 1–2)

Every number the current agents say must become a `Claim` with a source and an expiry. Start
with the five most repeated:

- the "5x in 90 days" guarantee,
- the missed-call value,
- the speed-to-lead statistic,
- the local case study,
- the seasonal event.

If a number cannot be sourced, it comes out of the copy. This is not a legal nicety; it is
what makes the post-generation gate possible.

### 4. One channel, one role (week 2–3)

Start with **Reviver + SMS** on the past-customer list, because it has consent, a clear
outcome (booked job), and the least integration risk. Keep the current system running for
everything else.

Success criteria for the pilot:

- booked jobs per 1,000 contacts **not worse** than baseline,
- sends per contact **at least 25% lower**,
- opt-outs **at least 25% lower**,
- zero claim or consent blocks that should have been sends (review every block).

### 5. Cut over and retire (week 4+)

- Route all inbound through Concierge.
- Route post-job through Advocate.
- Move SEO/audit work to Analyst.
- Delete the four orchestrators and the persona factory.
- Keep the skins; delete the duplicate prompts.

---

## Adding a "new agent" after migration

A new persona is now four small decisions:

1. **Role** — which existing role's permissions does it need? If none, add a role with a
   move list, channels and autonomy. Do not add a new orchestrator.
2. **Skin** — warmth, brevity, formality, sample. Add to `VOICE_SKINS`.
3. **Moves** — reuse the catalogue. If a genuinely new move is needed, it must declare its
   target resource, pressure, evidence requirements and guard.
4. **Test** — one test for the move's policy behaviour, one for the scheduler preference, one
   for the rendered message.

The cost of the 15th persona is now a config diff and three tests, not 50 KB of new logic.

---

## What not to do

- **Do not** port the keyword router "for compatibility". It will re-create the problem.
- **Do not** give each role its own memory or safety layer. That is how the 14-agent sprawl
  happened.
- **Do not** let the LLM choose the move. The scheduler chooses; the model rewrites.
- **Do not** ship a claim without a source because "it converts". The claim gate is the
  product's defensibility.
- **Do not** keep a persona whose only difference is a name and a voice. That is a skin.

---

## Definition of done

- One decision path: signal → field → scheduler → policy → render → policy → action/wait.
- One event log that can replay the book.
- Four roles, four skins, sixteen moves.
- Every number traceable; every opt-out global; every vulnerable contact human.
- The old orchestrators deleted, not deprecated.
- A dashboard that shows the binding constraint and the policy verdict, not a chat toy.
