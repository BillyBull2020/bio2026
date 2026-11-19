# Results, method, and the pilot that would settle it

## Read this first

**These are simulation results, not field results.** The simulator is a decision aid: it
encodes the kernel's assumptions and checks that the logic produces the intended direction
under those assumptions. It is not evidence that a real roofing company will see these
numbers. The pilot design below is the evidence.

The simulation is in `src/sim/engine.ts`; run it yourself with:

```bash
node src/cli.ts simulate --contacts 800 --days 21 --seeds 6
```

---

## What is compared

| Arm | Policy | Cadence | Move selection | Can wait? |
|---|---|---|---|---|
| **Persona blasting** | Three generic touches | Days 0, 3, 6 | Random from a fixed pitch set | No |
| **Choice OS** | Same consent/quiet-hour baseline | Every 2 days, max 2–3 sends | Scheduler: binding constraint + intent + policy | Yes |

Both arms use the same move catalogue, the same six-resource field, and the same reply /
booking probabilities. The **only** differences are targeting, sequencing, and the option to
do nothing. That is deliberate: the comparison isolates the kernel.

Each contact has latent intent, trust prior, cognitive load, pressure sensitivity, channel
preference and ticket. The population is drawn from fixed distributions with a seeded PRNG,
so a run is reproducible.

### Outcome model

```
reply    = 0.045 · (0.2 + 1.8 · match) · (0.5 + 1.05 · intent)
           · channelFit · (1 − fatigue) · (1 − 0.28 · pressure)

book     = σ(−4.9 + 2.8·trust + 2.2·clarity + 1.5·anticipation
              + 1.2·agency + 0.8·safety − 1.6·pressure)

opt-out  = 0.0012 + 0.035·pressure² + 0.012·(1−match)
           + 0.008·(1−intent) + 0.01·sensitivity·pressure

complaint = 0.0008 + 0.012·pressure²
```

`match` is the gain-weighted alignment between the move and the contact's deficits, raised
to 2.2 so that hitting the *actual* binding constraint matters more than hitting any deficit.
`pressure` is cumulative spend, not a per-message flag.

---

## Headline results

800 contacts · 21 days · 6 seeds.

| Metric | Persona blasting | Choice OS | Delta |
|---|---:|---:|---:|
| Sends per contact | 2.92 | 1.97 | **−32.6%** |
| Reply rate | 6.8% | 7.9% | **+16.2%** |
| Booking rate | 2.63% | 2.83% | **+7.9%** |
| Opt-out rate | 5.06% | 2.88% | **−43.2%** |
| Complaints | 2 | 1 | −50% |
| Revenue per 1,000 contacts | $268,742 | $284,586 | **+5.9%** |
| Bookings per 100 sends | 1.24 | 1.65 | **+33%** |

The efficiency number is the important one: **+33% bookings per send**, with **43% fewer
opt-outs**. The raw booking lift is modest because the OS deliberately sends less.

### Cohort sensitivity

| Cohort | Booking lift | Revenue lift | Send change | Opt-out change |
|---|---:|---:|---:|---:|
| 400 contacts, 14 days, 6 seeds | +15.9% | +14.4% | −32.4% | −43.5% |
| 800 contacts, 21 days, 6 seeds | +7.9% | +5.9% | −32.6% | −43.2% |
| 1,200 contacts, 30 days, 8 seeds | +19.4% | +18.4% | −32.4% | −42.8% |

The direction is stable across cohorts. The magnitude is not: it depends on the population
mix and the number of planning cycles. Do not quote a single number as a guarantee.

### What drives the result

1. **Targeting.** The scheduler picks the move that addresses the largest weighted deficit.
   Random pitch selection often addresses a resource that is already adequate.
2. **Sequencing.** Proof before price. Safety before loss. Clarity before commitment.
3. **Restraint.** The OS sends ~1 fewer message per contact. Pressure and fatigue are lower,
   so the messages that are sent land better.
4. **Opt-out avoidance.** Pressure is quadratic in the opt-out model; the OS's pressure
   budget and zero-pressure moves compound.

---

## Assumptions (all of them)

1. Synthetic population; **not field data**. Latent intent, trust prior and load are drawn
   from fixed distributions.
2. Baseline models three generic persona touches over nine days with no state targeting and
   no constraint sequencing.
3. Choice OS uses the same move catalogue and field model, plans every two days, and is
   allowed to do nothing.
4. Reply and booking probabilities are monotone in the six resources and decreasing in
   accumulated pressure. Coefficients are informed assumptions, not measured effects.
5. Every arm respects consent. Opt-out and complaint probabilities rise with pressure and
   irrelevance, so the OS cannot win by pushing harder.
6. Revenue assumes a 65% close rate on booked jobs at the segment's average ticket.
7. The simulation does not model seasonality, competition, price changes, or deliverability.
8. The population is homogeneous in trade; a multi-trade book would change the mix, not the
   direction.

If assumption 4 is wrong — for example, if trust is not the dominant driver in roofing —
the field weights need re-fitting. That is what the pilot is for.

---

## The pilot that would settle it

### Design

- **Population:** the existing past-customer list, opted-in, 1,000–2,000 contacts.
- **Arms:** 50/50 randomised at the contact level.
  - **Control:** current 3-touch sequence.
  - **Treatment:** Choice OS, Concierge/Reviver, same channels.
- **Duration:** 4 weeks, or until 200 booked jobs, whichever is later.
- **Primary metric:** booked jobs per 1,000 contacts.
- **Guardrails:** opt-out rate, complaint rate, consent violations (must be zero), and
  revenue per 1,000.
- **Secondary:** sends per contact, reply rate, time-to-first-response, show rate.

### Analysis

- Intention-to-treat, not per-protocol.
- Pre-register the primary metric and the guardrail thresholds.
- Report a 95% interval, not a point estimate. With 1,000 contacts per arm and a ~3% booking
  rate, the interval is wide; plan for 2,000 per arm if you need to detect a 20% relative
  lift.
- Segment by trade and by binding constraint, but label those analyses exploratory.

### Decision rule

Ship the OS if:

- booked jobs per 1,000 is **not worse** (non-inferiority margin 10%), **and**
- sends per contact are at least 25% lower, **and**
- opt-outs are at least 25% lower, **and**
- consent violations are zero.

If bookings are equal and sends/opt-outs are lower, that is a win: the same revenue for less
attention and less risk. If bookings fall more than 10%, the field weights or the move
catalogue are wrong; do not scale.

### What would make us stop

- The treatment produces more complaints or opt-outs than control.
- Any consent violation.
- The claim gate blocks more than 30% of intended sends because the claims do not exist.
  That is a claims problem, not a scheduling problem; fix the evidence first.

---

## Reproduce

```bash
# full test suite (73 tests)
npm test

# deterministic simulation
node src/cli.ts simulate --contacts 800 --days 21 --seeds 6

# kernel demo (seeds a Denver roofing book, plans five decisions)
node src/cli.ts demo

# verify the event chain
npm run verify
```

All numbers in this document come from the committed simulator. Change a coefficient and
they will change; that is the point.
