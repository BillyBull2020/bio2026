# Industries and the First Real Targets

The kernel is vertical-neutral. The **demo** and **claims registry** are roofing. Everything
else needs its own ticket, offer, proof and claims.

## What the app supports

`node src/cli.ts industries` prints the presets:

| Preset | Average ticket | Missed calls/mo | Season |
|---|---:|---:|---|
| Roofing | $14,500 | 18 | hail / storm |
| HVAC | $9,500 | 22 | first heat wave / cold snap |
| Plumbing | $1,200 | 25 | freeze / holidays |
| Electrical | $2,500 | 15 | panel upgrades / EV |
| Restoration | $22,000 | 12 | storm / freeze |
| Pest control | $450 | 20 | spring / summer |
| Landscaping | $3,500 | 10 | spring installs |
| Solar | $18,000 | 8 | utility rates |
| Painting | $4,500 | 8 | spring / fall |
| Garage doors | $2,500 | 12 | spring / winter |

Set one:

```powershell
node src/cli.ts setup-tenant --name "Acme Heating" --industry hvac --city "Aurora" --state CO --owner "Sam" --phone "+13035550100"
```

The preset sets the trade and default ticket. It does **not** create claims. You must supply
the license, insurance, certifications, reviews and case studies.

## Where to start

### Tier 1 — sell this week

**Roofing + HVAC.** Both have:

- high tickets ($9.5k–$14.5k), so one recovered job covers the month;
- urgent demand (storm, heat, cold);
- owner-operators who still quote and answer the phone;
- visible missed-call pain;
- enough volume in Denver/Aurora/Lakewood/Centennial.

Roofing is already the demo and the claims. HVAC is the fastest second vertical: same decision
structure, same urgency, same owner, slightly lower ticket.

### Tier 2 — next 30 days

**Plumbing + restoration.** Plumbing has volume and emergency urgency; restoration has the
highest ticket and insurance complexity. Use plumbing for a high-volume proof, restoration for a
high-value case study.

### Tier 3 — after case studies

Electrical, pest, landscaping, solar, painting, garage. Good businesses, but either lower ticket,
longer sales cycle, or a more complex offer.

## The first 7 days

| Day | Work | Target |
|---|---|---|
| 1 | Build a list of 100 roofing/HVAC companies in Denver metro | 100 names, 60 with owner/phone |
| 2 | Score them: 5–50 employees, owner still quotes, no online booking or slow follow-up | 40 qualified |
| 3 | Send the one-page revenue-leak audit to 20 | 20 personalized emails |
| 4 | Call 15; leave 10 voicemails | 5 conversations |
| 5 | Book 5 demos with the 7-minute script | 5 demos |
| 6 | Run demos; send pilot offer + Stripe link | 2 pilots proposed |
| 7 | Follow up; close the first pilot | 1 paid pilot |

The assets already exist:

- [`PILOT-OFFER.md`](PILOT-OFFER.md) — $1,500 setup + $2,497/mo, 3-job/$10k guarantee
- [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) — 7-minute demo
- [`SALES-EMAILS.md`](SALES-EMAILS.md) — emails, call script, voicemail
- [`COMPETITIVE.md`](COMPETITIVE.md) — positioning and objections
- [`BILLING.md`](BILLING.md) — Stripe checkout
- [`90-DAY-PLAN.md`](90-DAY-PLAN.md) — the operating cadence

## The one-page audit

For each target, calculate:

```
missed calls/week × 52 × close rate (20%) × average ticket
```

Example, roofing:

```
20 missed calls/week × 52 × 20% × $14,500 = $3.0M/year at stake
```

You are not claiming they will recover all of it. The pilot recovers a slice, and the holdout
proves the slice. Say that.

## Industry hooks

| Industry | Hook | Proof |
|---|---|---|
| Roofing | “Every missed hail call is the next roofer's job.” | Storm-season before/after |
| HVAC | “A missed AC call in July is a replacement that went elsewhere.” | First heat-wave booking |
| Plumbing | “The emergency caller does not leave a voicemail.” | Same-day recovery |
| Restoration | “A water loss that waits an hour becomes a mold job.” | Time-to-answer |
| Electrical | “A missed estimate is a panel upgrade for the next licensed electrician.” | Estimate follow-up |
| Pest | “A missed call is a recurring plan that never starts.” | Recurring plan starts |
| Landscaping | “A missed spring call is a full season of maintenance.” | Season bookings |

## Claims warning

Do **not** reuse roofing claims for HVAC or plumbing. A license, insurance certificate, review or
case study is trade-specific. If the claim registry is empty, the policy gate blocks the claim
instead of inventing one. That is correct.

## What makes the app convert

- **A specific offer**, not “AI for business”: 30-day revenue recovery, 3-job guarantee.
- **A number on the first screen**: missed-call revenue and pipeline at stake.
- **A seven-minute demo**, not a 30-slide deck.
- **A human approval step** so the owner sees control, not risk.
- **A holdout** so the result is credible.
- **Industry presets and proof** so the buyer sees their trade, not a generic chatbot.
- **A fast close**: Stripe link, onboarding call, first ten messages in 48 hours.
