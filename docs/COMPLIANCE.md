# Compliance and Trust

This is an operating checklist, not legal advice. Have counsel review your consent language,
your 10DLC campaign, and your contract before the first real send.

## The rule that matters most

**No marketing message without prior express consent, for that channel, for that purpose.**
The OS enforces this in code: a missing or revoked consent is a blocked action, not a warning.

## SMS (TCPA / carrier rules)

1. **Collect consent with proof.** Record purpose, channel, source, timestamp and the exact
   language the customer saw. The `consent` event stores all five.
2. **Register 10DLC before sending.** Twilio requires brand and campaign registration. An
   unregistered campaign is filtered or blocked by carriers.
3. **Identify the business in every message.** The first message must say who is texting and
   why. The OS copy does this; do not strip it.
4. **Honor STOP immediately.** The conductor opts out on STOP, STOPALL, UNSUBSCRIBE, CANCEL,
   END, QUIT. No confirmation loop, no "are you sure?".
5. **Quiet hours.** Default 8:00–21:00 in the contact's local time. The policy engine blocks
   outside the window.
6. **Frequency cap.** The pressure budget and the 7/30-day caps are the guardrail. Do not
   override them to "get the campaign out."
7. **Keep records.** Consent, message, timestamp, opt-out and the decision that authorized
   the send. The event log is hash-chained and replayable; export it for counsel.
8. **No purchased lists.** A list you bought is not consent. Import it as zero-consent
   prospects; the scheduler waits.

## Email (CAN-SPAM)

- A real physical address in every commercial email.
- A working unsubscribe link; honor it within 10 business days (the OS honors immediately).
- Accurate From, subject and routing information.
- No misleading headers.
- Transactional and relationship messages are still subject to consent and platform policy.

## Reviews

- Ask every customer, not only the happy ones. **No review gating.**
- No incentive for a review. No "5 stars only" link.
- No invented review, no copied review, no review from another business.
- Platform rules (Google, Yelp, Facebook) prohibit gating and incentives. The OS refuses
  `review_gate` and `incentivized_review`.
- A negative review gets a human response, not a deletion request.

## Claims

Every factual claim must trace to a claim record:

- license number and issuing authority,
- insurance certificate,
- manufacturer certification,
- a signed case study with a named customer and permission,
- a real review with a permalink.

If the claim is not in the registry, the message is blocked. No "best in Denver," no "#1,"
no invented deadline, no fake scarcity.

## AI disclosure

Every message is sent by or on behalf of the business. If a customer asks whether they are
talking to a person, answer honestly. The OS can disclose: "This is the [Business] assistant;
a person will follow up." Do not impersonate the owner.

## Vulnerable contacts

The policy engine escalates when a contact mentions:

- an emergency, fire, flood, gas or structural danger,
- a legal threat, lawyer or lawsuit,
- a health crisis, bereavement or financial hardship,
- a complaint about a prior job.

Escalation means a human takes over. The OS does not keep selling.

## Data

- Collect the minimum: name, contact, service history, consent, claim evidence.
- Do not store payment card data in the event log.
- Encrypt at rest (disk or database) and in transit (TLS).
- Restrict console access; rotate the Basic Auth password and Twilio/Resend keys.
- Retain consent and opt-out records for at least four years.
- Honor deletion requests; keep only the minimum needed to prove consent and comply with law.

## Security

- The console is behind Basic Auth or a private tunnel. Do not expose port 4177 directly.
- `CHOICE_PUBLIC_URL` must match the Twilio signature URL.
- Keep `.env` out of git. `.env.example` contains names, never values.
- Rotate keys after any laptop loss, contractor departure or suspicious login.
- The event log is append-only; back it up daily and test a restore.

## Incident response

If a message goes to the wrong person or a claim is wrong:

1. Stop the campaign (remove the contact, pause the tenant).
2. Preserve the event log and the decision record.
3. Notify the owner and, if required, counsel.
4. Correct the claim registry before resuming.
5. Write a one-page post-mortem: what sent, why the rail missed it, what changed.

## Pre-flight checklist

- [ ] 10DLC brand and campaign approved.
- [ ] Consent language reviewed by counsel.
- [ ] STOP handling tested on a real phone.
- [ ] Quiet hours and frequency caps verified in the contact's timezone.
- [ ] Claims registry contains only verifiable claims.
- [ ] Review requests go to every completed job, with no gate.
- [ ] AI disclosure approved by the owner.
- [ ] Human handoff number monitored during send hours.
- [ ] Event log backed up and a restore tested.
- [ ] Incident contact and pause procedure documented.
