# The science, and what we are not claiming

## The short version

Choice OS is a **computational model of the conditions under which a person can decide**.
It does not measure neurotransmitters, read minds, or claim that a sentence "releases
dopamine". It estimates six resources from observable events, chooses the intervention that
is most likely to move the binding one, and refuses to manufacture pressure.

That is a narrower claim than the marketing language around "neurobiology", and it is the
only one that survives contact with a customer, a regulator, or a replication crisis.

---

## What we explicitly do **not** claim

| Claim we avoid | Why |
|---|---|
| "85% of decisions are subconscious." | A widely repeated number with no stable primary source. Decision-making is not a 15/85 split. |
| "This message releases dopamine." | We cannot measure synaptic dopamine from copy. Reward *prediction* is a useful design metaphor, not a per-message assay. |
| "The reptilian brain decides first." | The triune-brain model is obsolete. Threat and safety responses involve distributed networks. |
| "Oxytocin creates trust." | Intranasal oxytocin effects are inconsistent and context-dependent. Trust is better modelled as learned predictability plus benevolence evidence. |
| "Loss aversion is 2.5×." | The 2–2.5× figure is a common average from prospect theory, not a universal constant; it varies by domain and person. |
| "Neuro-language doubles conversion." | No. The model's value is in sequencing and constraint matching, and it must be tested. |

The existing BioDynamX site leans on several of these. They are good copy and bad evidence.
This system replaces them with testable structure.

---

## Why a resource model

A decision happens when the expected cost of acting falls below the expected cost of not
acting, *and* the person believes action is possible. That is deliberately close to **active
inference**: the brain minimises prediction error, and ambiguity is a cost. Under threat,
the prior shifts toward safety; under load, the action set narrows; under low agency, the
expected value of acting collapses even when the reward is large.

We therefore model **enabling conditions**, not persuading forces:

1. **Safety** — the interaction is not a threat. This is not "the customer is unaware of a
   problem"; it is "the conversation does not pressure, shame, or trap them".
2. **Trust** — credibility plus benevolence. Built by specific proof, consistency, and a
   credible exit.
3. **Anticipation** — a concrete, believable better state. The reward-prediction analogue:
   the value is in the *anticipation of relief*, not in the feature list.
4. **Clarity** — low cognitive load and a legible next step.
5. **Agency** — autonomy and competence. The person is choosing, not being moved.
6. **Commitment** — a small action already taken. Momentum, not manipulation.

These are **latent variables**. The kernel updates them from evidence with explicit,
conservative deltas, and decays them toward priors. Nothing is measured directly; everything
is falsifiable.

---

## Construct map

| Resource | Nearest constructs | Representative work | How the OS uses it |
|---|---|---|---|
| Safety | Interoception, social pain, threat/safety learning | Craig (2009); Eisenberger & Lieberman (2004); LeDoux (2015) | No loss framing when safety < 0.35; always pair a named loss with a control step. |
| Trust | Benevolence + ability + integrity; social proof | Mayer, Davis & Schoorman (1995); Cialdini (2009) | Same-trade, same-market proof; human bridge; refusal to overclaim. |
| Anticipation | Reward prediction error; affective forecasting | Schultz (1998); Wilson & Gilbert (2005) | A plausible ordinary Tuesday, not a fantasy. Contrast with the status quo. |
| Clarity | Cognitive load; choice overload | Sweller (1988); Iyengar & Lepper (2000) | Two options, one next step, the time it takes. |
| Agency | Autonomy, competence, relatedness | Deci & Ryan (2000) | A real exit; no false deadlines; "no" as easy as "yes". |
| Commitment | Implementation intentions; consistency | Gollwitzer (1999); Freedman & Fraser (1966) | A sub-two-minute action that is useful even if they never buy. |

The **three-system** language in the UI (threat, social, deliberative) is a *control
metaphor* for operators, not a neuroanatomical localisation. The brain does not have three
clean modules; the labels group resources by the kind of intervention that moves them.

---

## Where pressure fits

Pressure is not a resource. It is a **cost** with a hard budget.

```
pressure(move) ∈ [0, 1]
budget = 3.0 per contact per 30 days
```

Every high-pressure move spends budget; the scheduler subtracts it from expected gain, and
policy blocks any action that would exceed the budget. The budget is the ethical ceiling,
not a target. This is the structural difference between persuasion and coercion:

- **Persuasion** adds information, proof, clarity, or a genuine reason to act now.
- **Coercion** reduces the perceived cost of *not* acting by manufacturing threat, scarcity,
  shame, or exit costs.

The rails encode the line:

1. **No threat without a door.** A loss statement is legal only when it is evidenced and
   paired with a concrete control step, and only when safety is already above 0.35.
2. **No manufactured urgency.** A deadline must map to a real, future event.
3. **No review gating.** Every completed job is asked; no filtering for promoters.
4. **No exploitation of vulnerability.** A flagged vulnerable contact goes to a human and
   cannot receive automated pressure.
5. **Exit is always available.** Every marketing message carries a stop instruction; an
   opt-out is global and immediate.

This is also commercially rational. The simulation's opt-out and complaint probabilities
rise with pressure; the arm that pushes harder loses the audience it needs.

---

## What would falsify the model

The model makes specific, testable predictions. A credible pilot should test these, not the
vibes:

| Prediction | Test | Falsified if |
|---|---|---|
| Constraint-matched moves produce more replies than generic moves at equal send volume | Randomised move assignment within contact, stratified by binding constraint | No difference, or generic wins |
| The OS can send fewer messages for equal bookings | Holdout: 3-touch baseline vs OS, 4 weeks | Bookings fall > 10% while sends fall ≥ 30% |
| Lower pressure reduces opt-outs without reducing bookings | Compare pressure-budget variants (1.5 / 3.0 / 6.0) | Opt-outs flat or bookings rise with more pressure |
| Claim trace reduces complaints | Compare claim-gated vs ungated copy | Complaints flat and conversion unchanged |
| Wait decisions are not harmful | Log contacts where OS waits; compare to forced-send holdout | Forced sends produce materially more bookings per contact |

If the first prediction fails, the field weights are wrong. If the second fails, the
scheduler is not adding value. If the third fails, the ethical budget is costing money and
should be surfaced to the client as a priced choice, not hidden.

---

## How the model becomes copy

Each move in `src/neuro/moves.ts` declares:

- the resource it targets,
- the system it addresses,
- the pressure it spends,
- the evidence it requires,
- a **guard** — the sentence that keeps the move honest.

Examples:

| Move | Target | Guard |
|---|---|---|
| `local_proof` | Trust | "Same trade, same market, named with permission. The number comes from a signed case study, never from a template." |
| `name_real_loss` | Anticipation | "Only a verified, customer-specific loss. Always pair with a control step. Never when safety < 0.35." |
| `give_control` | Agency | "Include a real exit. 'No' must be as easy to send as 'yes'." |
| `calendar_hold` | Commitment | "The slots must exist. Never invent scarcity; a held slot is a promise." |
| `review_request` | Commitment/Trust | "Sent to every completed job, never only to promoters." |

The renderer can only use the facts it is given. A model may rewrite tone later, but it
cannot add a number, a deadline, or a guarantee — the policy gate runs again on its output.

---

## References

- Craig, A. D. (2009). How do you feel — now? The anterior insula and human awareness. *Nature Reviews Neuroscience*, 10(1), 59–70.
- Deci, E. L., & Ryan, R. M. (2000). The "what" and "why" of goal pursuits: Human needs and the self-determination of behavior. *Psychological Inquiry*, 11(4), 227–268.
- Eisenberger, N. I., & Lieberman, M. D. (2004). Why rejection hurts: a common neural alarm system for physical and social pain. *Trends in Cognitive Sciences*, 8(7), 294–300.
- Friston, K. (2010). The free-energy principle: a unified brain theory? *Nature Reviews Neuroscience*, 11(2), 127–138.
- Gollwitzer, P. M. (1999). Implementation intentions: Strong effects of simple plans. *American Psychologist*, 54(7), 493–503.
- Iyengar, S. S., & Lepper, M. R. (2000). When choice is demotivating. *Journal of Personality and Social Psychology*, 79(6), 995–1006.
- Kahneman, D., & Tversky, A. (1979). Prospect theory: An analysis of decision under risk. *Econometrica*, 47(2), 263–291.
- LeDoux, J. E. (2015). *Anxious: Using the Brain to Understand and Treat Fear and Anxiety*. Viking.
- Mayer, R. C., Davis, J. H., & Schoorman, F. D. (1995). An integrative model of organizational trust. *Academy of Management Review*, 20(3), 709–734.
- Schultz, W. (1998). Predictive reward signal of dopamine neurons. *Journal of Neurophysiology*, 80(1), 1–27.
- Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257–285.
- Trope, Y., & Liberman, N. (2010). Construal-level theory of psychological distance. *Psychological Review*, 117(2), 440–463.
- Wilson, T. D., & Gilbert, D. T. (2005). Affective forecasting: Knowing what to want. *Current Directions in Psychological Science*, 14(3), 131–134.

These are the shoulders the model stands on. None of them says a text message can dose a
neurotransmitter. The model uses their *structure* — prediction error, load, autonomy,
implementation intentions — and leaves the pharmacology to the pharmacologists.
