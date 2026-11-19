# What Choice OS is for

## One sentence

**Choice OS runs the revenue side of a service business.** It answers the phone, works the
customers you already have, handles the objection, books the job, asks for the review, and
reports the money — using a decision engine modeled on the neurobiology of choice.

It is not a chatbot, a CRM, or a roster of agents. It is the thing that decides what the
business does next with every customer, and then does it.

---

## The business problem it solves

A roofing company already owns the thing it keeps paying to acquire: **a list of people who
know them, called them, or hired them.** Most of that list is sitting in a CRM, a phone log,
or a notebook. The owner is busy on a roof. The office misses calls. Nobody follows up. The
same customer calls the next contractor.

The money is not in a new ad. It is in:

1. **Answering the calls that already come in** — every missed call is a job that goes to the
   next contractor.
2. **Working the list that already exists** — past customers, old quotes, unanswered forms.
3. **Handling the objection instead of dropping the lead** — price, timing, trust.
4. **Booking the job** — two real slots, one next step.
5. **Asking for the review** — every completed job, no gating.
6. **Showing the owner the money** — recovered revenue, jobs booked, cost, return.

Choice OS runs that loop. The owner connects the phone and inbox, presses **Run my day**, and
the OS works the queue under hard policy rails.

---

## A day in the life

**7:00am — the OS opens the book.**
It checks every lead and customer: who called and wasn't called back, who got a quote and went
quiet, who finished a job and hasn't reviewed, who objected on price, who asked for a human.

**7:05am — it chooses the next move for each one.**
Not a persona. A decision. For each person it estimates six resources, finds the binding
constraint, and picks the smallest move that moves it. If no move clears the bar, it waits.

**7:10am — it works the queue.**
It answers the missed call, sends the same-trade proof, answers the price objection with a
claim attached, offers two real calendar slots, confirms the booking, asks for the honest
review, or escalates to a human.

**5:00pm — the owner sees the day.**
Revenue recovered, jobs booked, pipeline at stake, reviews requested, actions taken, return on
AI. One screen. No dashboard archaeology.

---

## The neurobiology, translated into business moves

The site's framework is three phases. The OS uses them as the customer journey — with six
measurable resources underneath.

| Phase | Customer question | Neuro-logic | What the OS does |
|---|---|---|---|
| **01 · Stop the bleeding** | "Am I losing something?" | Cortisol, loss aversion, threat detection | Answer the missed call, re-open the dead file, name the leak with a verified number — always paired with a control step. |
| **02 · Build trust** | "Can I trust you?" | Oxytocin, social safety, reciprocity | Same-trade proof, answer the real objection, put a human on the line when trust is fragile. |
| **03 · Close the job** | "What exactly do I do next?" | Dopamine, anticipation, cognitive clarity | Two real slots, one plain next step, confirm and kill the no-show. |

Under those phases, the kernel tracks six resources:

| Resource | What it answers | Example move |
|---|---|---|
| **Safety** | Is this interaction safe? No pressure, no shame, an easy exit. | Give control: "Reply PASS and I'll close the file." |
| **Trust** | Are they credible and on my side? | Local proof from the same trade and market. |
| **Anticipation** | Can I see a believable better Tuesday? | Future pace: two jobs on the board before 8am. |
| **Clarity** | Do I know the next step? | Two options, one 20-second action. |
| **Agency** | Am I choosing this? | A real exit; no invented scarcity. |
| **Commitment** | Have I already taken a small step? | Send the Google profile link; hold two real slots. |

The OS does not "send a message and hope." It moves the resource that is actually blocking the
purchase, then stops. The pressure budget (3.0 per contact) and the rails make sure the
persuasion never becomes coercion.

---

## What "Run my day" actually does

1. **Ranks the book** by readiness and value, with inbound conversations first.
2. **Plans** the highest-yield legal move for each contact.
3. **Checks the rails** before generation: consent, quiet hours, frequency, pressure, claims,
   urgency, review integrity, AI disclosure, vulnerable contacts.
4. **Renders** the message deterministically; a model may rewrite tone, but not facts.
5. **Checks the rails again** after generation: no new number, no guarantee, no fake deadline.
6. **Sends** through the delivery webhook (Twilio, Resend, n8n, Zapier) or logs it in demo mode.
7. **Reports** what it did, what it refused, and how much value it moved.

The OS is allowed to **wait**. A system that cannot wait will always optimise for activity over
outcomes.

---

## What the owner has to connect

| Input | Why |
|---|---|
| A phone number (Twilio or equivalent) | Answer calls, miss fewer jobs, send SMS. |
| An inbox (Resend or equivalent) | Follow-up and reactivation. |
| A calendar | `calendar_hold` is blocked without two real slots. |
| The customer list | The existing book is the asset; import it with consent. |
| The claims | Every dollar and percentage must trace to a source. The rails block the rest. |

Until those are connected, the console runs on a demo book and **logs** actions instead of
sending them. That is deliberate: the rails are testable without a phone bill.

---

## The ROI arithmetic

The demo book is a Denver roofing company with a $14,500 average ticket.

- One recovered job pays for **10 months** of a $1,400/month AI cost.
- The seed book has **85 missed calls/month** across 16 contacts.
- At a 20% close rate, recovering a fraction of those calls is a five-figure month.
- The simulation (synthetic, not field data) shows **+33% bookings per send** and **43% fewer
  opt-outs** versus persona blasting.

The scoreboard in the console is deliberately simple: **revenue recovered, jobs booked, pipeline
at stake, return on AI.** Everything else is instrumentation.

---

## What it is not

- **Not a chatbot.** The chat is a surface; the decision is the product.
- **Not a CRM.** A CRM stores what happened. Choice OS decides what happens next.
- **Not a lead broker.** It works the customers the business already paid to acquire.
- **Not fourteen agents.** Four roles, sixteen moves, one kernel. Personas are voice skins.
- **Not a manipulation engine.** The pressure budget, consent gate, claim trace, review
  integrity and vulnerable-contact rails are structural, not a prompt.

---

## The one-line pitch

> **You already paid for the customers. We turn them into booked jobs — and show you the money.**

That is the business. The kernel is how it is delivered.
