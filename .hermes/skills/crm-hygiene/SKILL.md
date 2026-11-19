---
name: crm-hygiene
description: Audit a contact list for duplicates, missing consent, missing contact data and stale records. Use for sales operations and CRM cleanup.
---

# CRM Hygiene

Audit the list. Do not delete, merge or message anyone. Return a plan a human can approve.

## Check

1. Duplicate emails or phone numbers.
2. Contacts with no email and no phone.
3. Contacts with no marketing consent or an expired consent.
4. Contacts marked `needs_consent` who are still in an active campaign.
5. Contacts with no last-service date and no signal.
6. Contacts who opted out but still appear in the active count.

## Output

| Issue | Count | Example IDs | Action |
|---|---|---|---|

Then:

**Safe to delete** — only true duplicates and records with no contact method.
**Needs consent** — the count and the exact channel missing.
**Do not touch** — opted-out, vulnerable, or human-handoff records.

Never claim you changed the CRM. This is an audit.
