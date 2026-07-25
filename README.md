# Reconciliation Bot

Your CRM says you closed $50,000 last month. Your Stripe account says $47,000
actually came in. Nobody knows where the missing $3,000 went, because nobody
is checking the seam between "what the salesperson typed" and "what the money
actually did."

That seam is where revenue quietly disappears: a deal marked won that was
never actually paid, a payment that came in but never got logged as a deal, a
customer accidentally charged twice, a refund that still shows as closed
revenue on someone's forecast. None of these show up unless you compare the
two systems line by line, and nobody has time to do that by hand every day.

This bot does it every night. It pulls yesterday's Stripe payments and CRM
deals, matches them, and posts a plain Slack message: how many payments came
in, how many matched cleanly, and a short list of anything that didn't — with
a direct link to the Stripe charge and CRM deal for each one, so fixing it is
a click, not a spreadsheet hunt. Every mismatch also lands in a Google Sheet
a bookkeeper can work through. Runs on your own infrastructure.

---

## What it catches

| Type | Meaning | Why it costs money |
|---|---|---|
| `PAYMENT_NO_DEAL` | Money arrived, no CRM record of it | Untracked revenue — missing from every report built off the CRM |
| `DEAL_NO_PAYMENT` | Deal marked won, no money ever came in | Inflated forecast, decisions made on numbers that aren't real |
| `AMOUNT_MISMATCH` | Deal says $2,000, charge was $1,800 | An unlogged discount or a partial payment nobody flagged |
| `DUPLICATE_CHARGE` | Same customer, same amount, charged twice in a short window | Chargeback risk, an annoyed customer, a dispute fee |
| `ORPHAN_REFUND` | Charge was refunded, deal still shows as won | Revenue counted twice — once as real, once after it was given back |

Plus a sixth, softer signal: `REVIEW` — a match the bot is only 60-84%
confident in. It still pairs the payment and deal, it just wants a human to
glance at it before trusting it blindly.

## How it works

```
Stripe payments  ──┐
                    ├─→ normalize → match → classify → format ─┬─→ Slack (alert)
CRM deals        ──┘                                           └─→ Google Sheet (worklist)
                                                                 └─→ Postgres (system of record)
```

Matching isn't "same email, same day." It scores every payment against every
candidate deal on email, amount, and time, then assigns the highest-
confidence pairs first — so a customer with two charges and one deal gets
correctly flagged as a duplicate charge, not two separate mismatches. See
[`docs/DECISIONS.md`](docs/DECISIONS.md) for the full reasoning behind every
non-obvious choice in here, including why this isn't built on an LLM.

Runs nightly on a schedule, not in real time — reconciliation is a look-back
by nature, and real-time adds infrastructure this problem doesn't need.
Re-running the same night twice never double-counts anything; every write is
idempotent.

## CRM-agnostic by design

The CRM is only touched in two places: the fetch step and the normalization
step. Everything past that — the matching, the classifying, the formatting —
works off a plain contract shape and has no idea which CRM the data came
from. Built here on HubSpot (free tier, good API, no cost to develop
against), but swapping to GoHighLevel or Pipedrive means replacing one fetch
node and one normalize function, not a rewrite.

## Getting started

Full setup takes under 30 minutes on a machine that's never seen this repo —
`git clone`, `docker compose up`, import the workflow, connect four
credentials (Stripe, CRM, Slack, Google), activate. Step by step:
[`docs/INSTALL.md`](docs/INSTALL.md).

## Project docs

- [`docs/INSTALL.md`](docs/INSTALL.md) — setup, start to finish
- [`docs/CONTRACT.md`](docs/CONTRACT.md) — the exact data shape the two halves of this system agree on
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — every real design choice, and why
- [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) — an honest list of what this doesn't handle, and the hardening tests that prove the rest

## What this deliberately doesn't do

No dashboard, no multi-tenant SaaS layer, no multi-CRM adapter framework, no
real-time processing, no ML in the matcher, no currencies besides USD in v1.
Each of these is a real product decision, not something left unfinished —
see `docs/DECISIONS.md` for the reasoning behind each cut.

## Stack

Docker Compose, self-hosted n8n, Postgres, Stripe, HubSpot, Slack, Google
Sheets. JavaScript for the matching logic (n8n Code nodes run JS natively),
Python for the test-data seeder, Vitest for the test suite.
