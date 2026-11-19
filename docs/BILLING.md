# Billing and the First Five Pilots

The product can be sold before it has a billing integration. Use Stripe Payment Links and a
simple subscription; do not block the first five pilots on a checkout flow.

## The offer to bill

| Line | Amount | When |
|---|---|---|
| Pilot setup | **$1,500** | On signature, before import |
| Pilot month | **$2,497** | Day 0, covers days 1–30 |
| Ongoing | **$2,497/mo** | Monthly, cancel anytime with 30 days' notice |
| Setup credit | **–$1,500** | Applied to month two if the pilot continues |

The setup fee is what stops tire-kickers. It also pays for the import, the claims review and
the first campaign. Do not waive it for a business that cannot produce a list.

## Stripe setup (30 minutes)

1. Create a **Product**: `Choice OS — Revenue Recovery`.
2. Create two **Prices**:
   - one-time: `$1,500` setup,
   - recurring monthly: `$2,497`.
3. Create a **Payment Link** for each, or one link with both lines.
4. Require **name, email, phone, business name** at checkout.
5. Enable **automatic receipts** and **failed-payment retries**.
6. Put the link in the pilot agreement and the close email.

For the first five pilots, send the link and invoice manually. A full checkout inside the
console is a later optimization, not a launch blocker.

## The close sequence

1. Demo (7 minutes). Ask for the list and the Twilio number.
2. Send the pilot agreement and the payment link the same day.
3. On payment: schedule the 30-minute onboarding call.
4. Import the list; send the first ten messages to the owner's phone for approval.
5. Day 7: first numbers. Day 14: adjust. Day 30: renewal decision with the holdout report.

## What the agreement must say

- Scope: revenue recovery on the customer's existing book.
- Data: customer owns the list; we process it only to provide the service.
- Consent: customer represents it has lawful consent and will provide the source.
- Compliance: both parties will follow TCPA, CAN-SPAM and platform rules.
- Guarantee: 3 booked jobs or $10,000 attributed in 30 days, or the next month is free.
- Conditions: list size, handoff response, no mid-pilot offer change.
- Term and cancellation: monthly, 30 days' notice.
- Limitation of liability: fees paid, not consequential damages.
- No guarantee of a specific ranking, review or revenue beyond the pilot term.

Have counsel review the template before the first signature.

## Unit economics (one pilot)

| Cost | Monthly |
|---|---|
| Twilio SMS (≈1,500 messages) | $40–$80 |
| Resend email | $0–$20 |
| Hermes/model usage | $10–$30 |
| Hosting / tunnel / storage | $20–$50 |
| **Gross margin** | **~95%** |

The business is software margin with a human onboarding cost. The constraint is not compute;
it is the number of pilots one operator can onboard well.

## When to raise the price

After three case studies with booked-job numbers:

- new customers: **$3,497/mo**, setup **$2,000**;
- existing pilots: grandfather at $2,497 for six months;
- add a **$997/mo** "second location" line.

Do not compete on price with lead marketplaces. Compete on recovered revenue and proof.

## What not to do

- Do not bill for "leads" or "impressions."
- Do not take a percentage of revenue in the first pilots; it complicates attribution and
  invites disputes.
- Do not promise a review rating, a ranking or a specific number of jobs beyond the guarantee.
- Do not let an unpaid pilot run past day 14. Pause sends; keep the data.
