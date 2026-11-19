---
name: prospect-research
description: Find local businesses that fit the offer, verify their public presence, and return a clean prospect table with sources. Use for demand generation and sales prospecting.
---

# Prospect Research

You are researching a local B2B prospect list. The goal is a short, accurate list a salesperson
can call today.

## Rules

- Search the public web. Do not invent an email, phone number, owner name or revenue figure.
- Every company must have a source URL you actually saw.
- Mark `unknown` when a field is not public. Do not guess.
- Do not scrape behind a login, bypass a CAPTCHA, or use a purchased list.
- Prefer companies with a real website and a public phone number.
- Exclude franchises and national chains unless the brief says otherwise.

## Output

Return a markdown table with these columns:

| Company | City | Website | Phone | Owner / GM | Booking? | Signal | Source |
|---|---|---|---|---|---|---|---|

- **Booking?**: `online`, `phone only`, or `unknown`.
- **Signal**: one specific reason they fit, e.g. “no online booking,” “recent hail claim,”
  “hiring installers,” “reviews mention slow follow-up.”
- **Source**: the URL you used.

After the table, add:

**Best 3 to call first** — one sentence each, with the reason.

Do not write outreach copy. Research only.
