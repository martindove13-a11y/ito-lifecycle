# diag-airtable-schema.md

Base: ITO Diagnostic
App: ito-lifecycle, served at lifecycle.itstheoutcome.com
Base id: appI1ApCcF1eANGYX
Workspace: My First Workspace (wspvsyF8R0a8RRsYT)
Created: 2026-10-01 from Diagnostic App Spec v0.1

Conventions, as in the Sprint: plain-text keys, no linked records, JSON in Long text fields, field names with capitals and spaces exactly as below. The proxy (diag-airtable.js) is the only thing that touches this base. Every field's Airtable description states who writes it and who may read it; treat those descriptions as the allowlist source of truth and copy them into DIAG_WRITE_FIELDS, STAMPED and SUPER_ONLY.

Join key everywhere: Deal code.

## Tables

| Table | Table id | Primary field | One row per |
| --- | --- | --- | --- |
| Deals | tblkaC7eCP9URElxt | Deal code | Deal, in every mode and perspective |
| Responses | tbl7mkeGblTrBDMOf | Response key | Respondent on a deal |
| Invites | tbl3sXs6zYm9Q55zE | Invite token | Counterpart invite, Discovery send, customer invite, reverse invite |
| Sessions | tbl6jhmjTzv4290Ci | Session key | Facilitated review of one deal |
| Companies | tbldse56o535u470Z | Company code | Cohort company |
| Rulings | tbl3ehuRHieEFh9EX | Ruling number (autonumber) | Ruling in the findings log |
| Aggregates | tbl0A81hA5g4HeFHn | Segment key | Computed segment |

## Deals

Deal code, Mode, Perspective, Source, Commercial model, Renewal date, Signed date, Signed band, Renewal band, Size band, Value band, Stage, Customer industry, Service lines, Value function, Email domain, Account, Rep key, Company code, Portfolio key, Performance (JSON), Renewal outcome, Instrument version, Consent version, Created at

Select options
- Mode: Quick check | Discovery | Facilitated review
- Perspective: Supplier view | Customer view (same values as the Sprint Diagnostics table)
- Source: Website | Community | ELEVATE card | Rep send | Counterpart invite | Customer invite | Portfolio | Cohort
- Commercial model: Fixed fee | Time and materials | Subscription | Consumption | Outcome-aligned | Outcome-based (draft; confirm against the methodology)
- Signed band: Under 1 year | 1 to 2 years | 2 to 3 years | Over 3 years (derived from Signed date)
- Renewal band: Past due | Within 3 months | 3 to 6 months | 6 to 12 months | Over 12 months (derived from Renewal date)
- Size band: SMB | Mid-market | Enterprise | Global (Sprint)
- Value band: <$100k | $100k-$1m | $1m-$10m | >$10m (Sprint)
- Stage: Pre-contract | In life | Renewed | Churned | Disputed (Sprint)
- Value function: Yes | No | Don't know
- Renewal outcome: Not yet due | Renewed | Churned | Unknown

Server-stamped, never from the client: Email domain, Account, Rep key, Portfolio key, Signed band, Renewal band, Instrument version, Consent version, Created at.

## Responses

Response key, Deal code, Perspective, Respondent role, View type, Answers (JSON), Headlines (JSON), Sales question, Email, Email domain, Session token, Results token, Invited by, Completed at, Seconds to complete, Seconds reading, Plausibility flag, Counted in benchmark, Instrument version, Consent version, Created at

Select options
- Respondent role, supplier: Sales | Customer success | Services or delivery | Commercial or deal desk | Value engineering | Executive
- Respondent role, customer: Executive sponsor | Business owner | Operations or end user | Procurement or commercial | Finance
- View type: Single | Joined | Two-sided
- Sales question: Yes | No | Don't know

JSON shapes
- Answers: {"1": {"rung": 0-4 or "dk", "show_tick": true|false}, ... "9": {...}}
- Headlines: {"sold": level, "contracted": level, "provable": level} where level is input | technical | operational | financial | "dk"

Read rules
- Session token: returned only to the owner at start, never through any other read.
- Email: super_admin only. Cleared on invitees when the invite completes or expires.
- Counted in benchmark, Plausibility flag: server-set only.

## Invites

Invite token, Deal code, Kind, Perspective, Invitee role, Invitee email, Inviter response, Rep key, Status, Sent at, Expires at, Completed at

Select options
- Kind: Counterpart | Discovery send | Customer invite | Reverse invite
- Perspective: Supplier view | Customer view (the perspective the invitee answers from)
- Status: Sent | Opened | Completed | Expired

Invitee email is cleared by diag-nudge when Status becomes Completed or Expired.

## Sessions

Session key, Deal code, Company code, Facilitator, Account, Session date, Attendees (JSON), Visibility map (JSON), Grid (JSON), Headlines (JSON), Story chain (JSON), Capture proposal (JSON), Second reader (JSON), Status, Confirmed at, Override reason, Instrument version, Created at

Select options
- Status: Scheduled | In session | Proposed | Confirmed | Second read | Locked

Grid cell shape, keyed "element:moment" (1-9 : 1-8)
{"expected": "created|carried|none", "state": "seen|described|absent", "na": null | "NA-INPUT" | "NA-TECH" | "NA-NOT-REACHED", "quals": {"documented": bool, "visible": bool, "data": bool, "agreed": bool, "current": bool}, "where": "", "note": "", "conf": "high|low", "score": 0-3}

expected is copied from lib/diag-core.js when the session opens. score is computed by the server from state and quals; the facilitator never writes it. Cells with expected = none are not a choice and carry no score.

Write rules
- Facilitator: everything except Capture proposal and Second reader.
- Agent (through diag-ai-background): Capture proposal only.
- super_admin: all.
- Server refuses a start when Attendees has fewer than two functions unless the caller is super_admin and Override reason is non-empty, and refuses when the Company's NDA status is not Signed.

## Companies

Company code, Account, Deals planned, Deals scored, Letter status, NDA status, Results session date, Company token, Findings pack (JSON), Findings built at

Select options
- Letter status: Not sent | Sent | Agreed
- NDA status: Not sent | Sent | Signed

Company token (co_) reads this company's Findings pack only.

## Rulings

Ruling number, Element, Moment, Text, Source session, Applies from, Instrument version

Element and Moment are single selects numbered 1 to 9 and 1 to 8. super_admin write only. Every credential may read.

## Aggregates

Segment key, Perspective, Dimension, Band, Responses, Metrics (JSON), Suppressed, Rolled into, Computed at

- Dimension: All | Size band | Value band | Commercial model | Signed band | Renewal band | Industry | Role | Validated
- Segment key format: perspective|dimension|band, for example supplier|size|Enterprise
- Suppressed is set when Responses < 10; Rolled into names the wider segment.

Only diag-nudge (scheduled) and the super_admin aggregate action write here. Pages read from here and never scan the base.

## Not in the base on purpose

- No customer name field anywhere.
- No linked records; join on Deal code.
- No contract files. Upload, if ever added, is processed and discarded.
- Question wording, ladder, expected-presence grid, role-to-moment table, bands and scoring live in lib/diag-core.js, not here.
