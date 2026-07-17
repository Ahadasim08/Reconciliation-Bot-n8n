# Reconciliation Bot — End-to-End Build Plan

**Version:** 1.0 (locked)
**Team:** Ahad, Murad
**Duration:** 21 days, hard cap
**Status:** Not started

---

## 0. What this is

A nightly n8n workflow that compares **Stripe payments** against **CRM deals** and reports every place the two disagree.

Stripe records what actually happened to the money. The CRM records what a salesperson claimed happened. Humans are in the loop on the CRM side, so the two drift apart. Nobody at a small business is checking the seam between them, because the seam belongs to nobody.

This bot is the thing that checks.

### The five exception types

| Type | Meaning | Business cost |
|---|---|---|
| `PAYMENT_NO_DEAL` | Money arrived, no CRM record | Untracked revenue, missing from every report |
| `DEAL_NO_PAYMENT` | Deal marked won, no money | Forecast is inflated, decisions made on bad numbers |
| `AMOUNT_MISMATCH` | Deal says $2,000, charge was $1,800 | Unlogged discount or partial payment |
| `DUPLICATE_CHARGE` | Same customer, same amount, short window | Chargeback risk, lost client, $15 dispute fee |
| `ORPHAN_REFUND` | Refunded, deal still shows won | Revenue counted that was given back |

Plus a sixth non-exception state: `REVIEW` — matched but with low confidence. A human confirms.

---

## 1. Definition of done

The project is done when **all** of these are true. Not "mostly." All.

1. `git clone` + `docker compose up` + import workflow + connect credentials + activate → working system in under 30 minutes on a machine that has never seen this repo
2. The seeder creates a known dataset with exactly 5 planted exceptions plus 4 hostile edge cases
3. Running the workflow against that dataset produces **exactly** the expected exception list — not 4, not 7
4. Running it a second time produces the same list, not double
5. `npm test` passes with ≥ 20 test cases covering every edge case in section 7
6. Every API node has an error branch that is tested by deliberately breaking it
7. README explains the problem to a non-technical reader in under 200 words
8. A 60-second screen capture exists showing seed → run → Slack → Sheet → real Stripe charge
9. It is posted on LinkedIn and added to the Upwork portfolio

### Non-goals (write these down, they are how the project stays 21 days)

- **No web dashboard.** Goes in README under "possible extensions." Building it is a second product.
- **No multi-tenancy, auth, signup, or billing.** This is installable for one client, not a SaaS.
- **No multi-CRM support.** One CRM, one seam. See section 8.
- **No real-time processing.** It's a nightly look-back. That's the correct design.
- **No ML / LLM in the matcher.** Deterministic scoring. An LLM here is worse: slower, non-reproducible, untestable, and impossible to explain to a client.
- **No handling of currencies other than USD** in v1. Documented limitation.

### Kill criteria

Stop and re-plan if any of these hit:

- Day 5 arrives with no end-to-end run (even ugly). → Cut Sheets, cut edge cases, get a run.
- The spike (Phase 0) shows the CRM's free tier can't filter by date. → Switch CRM, see section 8.
- Day 14 arrives and the matcher isn't passing its tests. → Cut exception types down to 3. Ship 3 that work over 5 that don't.

---

## 2. The contract between the two halves

**This is the most important section in the document. Agree it on day 1, in writing, before anyone writes code.**

Everything Ahad builds produces this shape. Everything Murad builds consumes this shape. Neither ever sees the other's internals.

```js
// A normalized payment (from Stripe)
{
  source: "stripe",
  id: "ch_3Ox1a2B...",          // native ID, for the link back
  email: "sarah.chen@acme.com",  // ALREADY lowercased, plus-tag stripped
  name: "Sarah Chen",            // may be null
  amount: 2000.00,               // DOLLARS as a number, never cents, never string
  currency: "usd",
  timestamp: "2026-01-14T10:14:32.000Z",  // ALWAYS UTC ISO8601
  refunded: false,
  refundedAmount: 0.00,
  url: "https://dashboard.stripe.com/test/payments/ch_3Ox1a2B..."
}

// A normalized deal (from the CRM — ANY CRM)
{
  source: "hubspot",             // or "gohighlevel", "pipedrive", etc.
  id: "8801",
  email: "sarah.chen@acme.com",  // ALREADY normalized, same rules
  name: "Sarah Chen",
  amount: 2000.00,
  currency: "usd",
  timestamp: "2026-01-14T00:00:00.000Z",  // close date, UTC
  stage: "closedwon",
  url: "https://app.hubspot.com/contacts/12345/deal/8801"
}
```

### Contract rules — no exceptions

- **Money is always a number in dollars.** Stripe gives cents. HubSpot gives a string. Both get converted before they cross this line. `2000.00`, never `200000`, never `"2000"`.
- **Emails are always lowercased and plus-tag-stripped before they cross this line.** The matcher never sees `Sarah.Chen@ACME.com`. If the matcher is doing email cleanup, the contract is broken.
- **Timestamps are always UTC ISO8601.** No local time, no epoch, no date-only strings.
- **`url` is always populated.** This is what makes the Sheet clickable and the demo real.
- **Missing data is `null`, never `""`, never `0`, never `undefined`.**
- **The matcher must not know which CRM the deal came from.** If `matcher.js` contains the string "hubspot" anywhere, the seam is broken.

If either person needs to change this shape, it is a **conversation, not a commit.** Both people update, both test, same day.

---

## 3. Tech stack, and why each thing is there

| Component | Choice | Why | If it fights back |
|---|---|---|---|
| Container runtime | Docker + Compose | The thing that makes it *installable* rather than "works on my laptop" | No fallback. This is the deliverable. |
| Workflow engine | n8n, self-hosted | It's the entire point of the project | No fallback. |
| n8n backend DB | Postgres (not SQLite) | You need Postgres anyway for the exception log. Two DBs where one would do is silly. Also SQLite in Docker means volume pain. | SQLite if Postgres setup eats > 2 hours, but you'll regret it |
| Exception log | Postgres, separate database, same instance | Upsert on `(charge_id, exception_type)` is what makes re-runs idempotent | None. This is load-bearing. |
| Payments | Stripe test mode | Free, no business verification, rich test tokens | None. Stripe is the standard. |
| CRM | HubSpot free tier | Most common CRM in Upwork job posts. Free. Good API docs. | See section 8 for the full comparison |
| Matcher language | JavaScript | **Forced.** n8n Code nodes run JS. Python mode exists via Pyodide but is slower, more limited, and a trap. | None. |
| Seeder language | Python | Ahad's language. Fully separate from the workflow, so it can be anything. | Node if you'd rather have one language |
| Test runner | Vitest | Fast, near-zero config. Jest is the heavier older alternative — a coin flip, not a decision. | Jest. Changes nothing. |
| Human-facing output | Google Sheets | Bookkeepers already live in spreadsheets. Zero learning curve. | **Cut it if Google OAuth eats > 2 hours.** Postgres already has every row. |
| Alerting | Slack incoming webhook | Where the team already is. Nobody opens dashboards. | Discord webhook, or email. Trivial swap. |
| Version control | GitHub, public | The repo is the proof it's real | None. |
| AI assistance | Claude Code | Writes seeder, matcher, tests, docs, JSON | Cannot click OAuth screens. That's human work. |

### What is deliberately NOT in the stack

- **No LangChain, no LLM, no embeddings.** This is a deterministic matching problem. Reaching for an LLM here would be a signal you don't know when *not* to use one — which is worse for your positioning than not using one at all.
- **No React, no frontend, no dashboard.** See non-goals.
- **No queue, no Redis, no workers.** It processes ~50 records once a night. Adding infrastructure to a problem this size is a tell.
- **No Kubernetes.** Same.

---

## 4. Repo layout

```
reconciliation-bot/
├── README.md                    # The problem, in plain English, for a non-technical reader
├── CLAUDE.md                    # Session rules for Claude Code
├── progress.md                  # Living session log — see section 11
├── PLAN.md                      # This document. Read-only after day 1.
├── docker-compose.yml           # n8n + postgres
├── .env.example                 # Every credential, documented, no real values
├── .gitignore                   # .env, node_modules, __pycache__, exports/
│
├── seeder/                      # PERSON A
│   ├── requirements.txt
│   ├── seed.py                  # Creates the dataset
│   ├── teardown.py              # Deletes everything tagged seed:*
│   ├── scenarios.py             # The dataset definition — single source of truth
│   └── expected.json            # THE SCORECARD — generated by seed.py
│
├── src/                         # PERSON B
│   ├── normalize.js             # Raw API shape -> contract shape (section 2)
│   ├── matcher.js               # THE BRAIN. Pure function. No I/O. No API calls.
│   ├── classify.js              # Match results -> exception types
│   └── format.js                # Exceptions -> Slack blocks + Sheet rows
│
├── test/                        # PERSON B
│   ├── matcher.test.js
│   ├── normalize.test.js
│   ├── classify.test.js
│   └── fixtures/
│       ├── clean.json
│       ├── edge-cases.json      # Every case from section 7
│       └── hostile.json         # Section 7.4
│
├── build/
│   └── inject.js                # Reads src/*.js -> writes into workflow.json Code nodes
│
├── workflow/
│   ├── workflow.json            # The importable n8n workflow (generated, do not hand-edit)
│   └── workflow.template.json   # Hand-maintained skeleton, code nodes empty
│
├── db/
│   └── schema.sql               # exceptions table, runs table
│
└── docs/
    ├── INSTALL.md               # The 20-minute setup, step by step
    ├── DECISIONS.md             # Why each choice was made — this is portfolio gold
    └── LIMITATIONS.md           # Honest list of what it doesn't handle
```

### Why the build step exists

`matcher.js` is a real file. Claude Code edits it, Vitest tests it. But n8n needs that code inside a Code node, which is a JSON string inside `workflow.json`.

`build/inject.js` reads the tested file and writes it into the JSON. `npm run build` does it. This means **the code you tested and the code that runs are guaranteed identical.** Hand-pasting means one day you'll fix a bug, forget to paste, and your demo will run the old broken version while your repo says otherwise.

`workflow.json` is generated. Never hand-edit it. If you need to change a node, change `workflow.template.json` or rebuild from the n8n UI export.

---

## 5. The split

### Ahad — "Upstream"
**Owns:** everything that produces contract-shaped data. APIs, credentials, seeding, fetching, infrastructure.

- Docker Compose, Postgres, schema
- All four credential setups (Stripe, CRM, Slack, Google)
- The seeder and teardown scripts
- The scenario dataset and `expected.json`
- The n8n fetch nodes (Stripe node, CRM node, pagination loop)
- The CRM-agnostic seam (section 8)
- `INSTALL.md`

### Murad — "Downstream"
**Owns:** everything that consumes contract-shaped data. Logic, tests, outputs.

- `normalize.js`, `matcher.js`, `classify.js`, `format.js`
- The entire test suite
- The build/inject step
- The n8n Code nodes, Switch node, output nodes
- Slack formatting, Sheet writing, Postgres upsert
- `DECISIONS.md`, `LIMITATIONS.md`

### The honest note on this split

**Murad has the more interesting job.** The matcher is the differentiating work — the thing that ends up in the portfolio writeup. Ahad does more grinding: OAuth screens, Docker volumes, API pagination. Split it knowing that. Consider swapping ownership at Phase 5 so both people touch the interesting part.

### How you avoid blocking each other

Murad does **not** wait for Ahad's real API data. On day 1, Ahad hand-writes `test/fixtures/clean.json` in the contract shape and commits it. Murad builds and tests the entire matcher against fixtures, with no APIs, no Docker, no credentials. The two halves meet at Phase 5.

If Murad is ever blocked on Ahad, the contract wasn't specific enough. Fix the contract.

---

## 6. Phases

### Phase 0 — The spike (Day 1, both people, half a day each)

**Purpose:** prove the plan isn't built on a false assumption. Throwaway code. Deleted after.

Ahad writes ~40 lines of Python that proves, one at a time:

1. Stripe test mode: create a charge → succeeds
2. Stripe: list charges with `created[gte]` / `created[lte]` date filter → returns it
3. Stripe: create a refund → succeeds
4. **CRM free tier: create a contact and a deal → succeeds**
5. **CRM free tier: fetch deals filtered by a date range → THE BIG ONE**
6. **CRM free tier: fetch the contact associated with a deal → the email lives on the contact, not the deal. Without this there is no join key and there is no project.**
7. Slack incoming webhook: post a message → appears
8. Google Sheets API: append a row → appears

Murad, in parallel:

1. `docker compose up` with n8n + Postgres → n8n loads at localhost:5678
2. Create a Code node in the UI, `return [{json:{hello:"world"}}]` → executes
3. Export that workflow as JSON → confirm the Code node's JS is a string in the JSON. **This is the fact the entire build step depends on.**
4. Re-import the JSON → confirm it works

**Exit criteria:** all 12 checks pass, or the plan changes today rather than on day 12.

**If check 5 fails** (CRM free tier can't filter by date): fall back to fetching all deals and filtering client-side. Works fine at demo scale, documented as a limitation. If check 4 or 6 fails, switch CRM entirely — see section 8.

**Deliverable:** `progress.md` created, with a table of all 12 checks and their real results. Spike code deleted.

---

### Phase 1 — Foundations (Days 2–3)

**Ahad:**
- `docker-compose.yml`: n8n + Postgres, named volumes, healthchecks, restart policy
- `db/schema.sql` — two tables:
  ```sql
  CREATE TABLE runs (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    payments_fetched INT,
    deals_fetched INT,
    matched INT,
    exceptions INT,
    status TEXT,              -- 'ok' | 'partial' | 'failed'
    error TEXT
  );

  CREATE TABLE exceptions (
    id SERIAL PRIMARY KEY,
    run_id INT REFERENCES runs(id),
    exception_type TEXT NOT NULL,
    charge_id TEXT,
    deal_id TEXT,
    email TEXT,
    amount NUMERIC(12,2),
    confidence INT,
    detail JSONB,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (exception_type, charge_id, deal_id)   -- THE IDEMPOTENCY KEY
  );

  CREATE TABLE matches (   -- recommendation #2: log the clean ones too
    id SERIAL PRIMARY KEY,
    run_id INT REFERENCES runs(id),
    charge_id TEXT,
    deal_id TEXT,
    confidence INT,
    reasons JSONB
  );
  ```
  The `UNIQUE` constraint is what makes re-runs safe. Everything upserts against it.
- `.env.example` with every credential documented
- All four credentials obtained and working, stored in n8n's credential store (never in the repo)

**Murad:**
- `package.json`, Vitest configured, `npm test` runs and passes one trivial test
- `test/fixtures/clean.json` — the 7 charges and 6 deals from the worked example, in contract shape, hand-written
- `src/matcher.js` stub: correct signature, returns empty, one passing test
- `build/inject.js` — proven against the Phase 0 exported workflow

**Both:** the contract (section 2) committed as `docs/CONTRACT.md`, both signed off.

---

### Phase 2 — The seeder (Days 4–5, Ahad)

`seeder/scenarios.py` is the **single source of truth** for the dataset. `seed.py` reads it and creates real records. It also emits `expected.json` — the scorecard.

**The dataset — 50 records total.**

Clean matches (~40 records): normal charge + matching deal. Amounts $250–$5,000, spread across the day.

Planted exceptions (5):

| # | Type | Setup |
|---|---|---|
| 1 | `DUPLICATE_CHARGE` | Mike, two × $500, 10 min apart, one deal |
| 2 | `PAYMENT_NO_DEAL` | David, $3,000 charge, no deal exists |
| 3 | `DEAL_NO_PAYMENT` | Priya, deal $1,200 closedwon, no charge |
| 4 | `ORPHAN_REFUND` | Tom, $1,100 charged then refunded, deal still closedwon |
| 5 | `AMOUNT_MISMATCH` → `REVIEW` | Jenna, charge $1,940.50, deal $2,000 (2.98% — inside fee tolerance) |

Hostile edge cases (4) — **these must all MATCH, not fire**:

| # | Case | Setup |
|---|---|---|
| 6 | Email casing | Stripe `sarah.chen@acme.com`, CRM `Sarah.Chen@ACME.com` |
| 7 | Plus-tag | Stripe `jenna@northstar.io`, CRM `jenna+billing@northstar.io` |
| 8 | Timezone boundary | Charge Jan 14 23:58 UTC, deal closed Jan 15 00:04 UTC |
| 9 | Same name, different people | Two contacts named "John Smith", different emails, different deals |

**Seeder requirements:**

- Every record tagged `metadata: {seed: "batch-<timestamp>"}` so teardown can find it
- `--dry-run` prints what it would create without calling any API
- Idempotent: running it twice does not create 100 records. Check for the tag first.
- Deterministic: same seed value → same dataset → same `expected.json`
- `teardown.py` deletes everything with the tag. Run it before every re-seed.
- Rate limiting: HubSpot's free tier has real limits. Sleep between calls. Handle 429 with backoff.
- Stripe test tokens: `tok_visa` (succeeds), `tok_chargeDeclined` (fails — seed one, it should be ignored entirely, not matched)

**`expected.json` — the scorecard.** Written on paper before the code exists:

```json
{
  "window": "2026-01-14",
  "payments_expected": 47,
  "deals_expected": 45,
  "exceptions_expected": 5,
  "exceptions": [
    {"type": "DUPLICATE_CHARGE",  "charge_id": "<runtime>", "amount": 500.00},
    {"type": "PAYMENT_NO_DEAL",   "charge_id": "<runtime>", "amount": 3000.00},
    {"type": "DEAL_NO_PAYMENT",   "deal_id":   "<runtime>", "amount": 1200.00},
    {"type": "ORPHAN_REFUND",     "charge_id": "<runtime>", "amount": 1100.00},
    {"type": "REVIEW",            "charge_id": "<runtime>", "confidence": 85}
  ],
  "must_match_not_flag": ["sarah_casing", "jenna_plustag", "raj_midnight", "john_smith_collision"]
}
```

**Exit criteria:** `python seed.py` → real data in Stripe and the CRM → `expected.json` written. `python teardown.py` → all of it gone.

---

### Phase 3 — Normalize + the matcher (Days 4–9, Murad, parallel with A)

This is the heart. It runs entirely against fixtures. No APIs, no Docker, no waiting on Ahad.

**`src/normalize.js`** — raw API shape → contract shape.

```js
normalizeEmail("Sarah.Chen+billing@ACME.com")  // -> "sarah.chen@acme.com"
normalizeAmount(200000, "stripe")              // -> 2000.00
normalizeAmount("2000", "hubspot")             // -> 2000.00
normalizeTimestamp(1705227272, "stripe")       // -> "2026-01-14T10:14:32.000Z"
```

Email rules, in order: trim → lowercase → strip everything between `+` and `@` → done. **Do not strip dots.** Gmail ignores dots; most providers don't. Stripping them would merge `j.smith@` and `jsmith@` at other providers, which are genuinely different people. This is a deliberate decision — write it in `DECISIONS.md`.

**`src/matcher.js`** — a pure function. No I/O, no API calls, no `console.log`, no date-of-today. Everything it needs is an argument. This is what makes it testable.

```js
match(payments, deals, config) -> {
  matched:   [{payment, deal, confidence, reasons}],
  review:    [{payment, deal, confidence, reasons}],
  unmatchedPayments: [payment],
  unmatchedDeals:    [deal]
}
```

**Scoring:**

```
email exact                    +50
name fuzzy (Levenshtein > 0.85) +20   // only when email is absent on both sides
amount exact                   +40
amount within feeTolerance     +25    // default 3.5%, configurable
amount within 10%              +10
timestamp within 24h           +10
timestamp within 48h           +5

>= 85   auto-match
60-84   review queue
< 60    exception
```

**Every threshold in `config`, none hardcoded.** A client with different Stripe fees changes a config value, not your code.

**Matching algorithm — the part that will bite you:**

Naive approach: for each payment, find the first deal with the same email, match it, move on. This breaks the instant a customer has two deals. **Mike is the proof:** two charges, one deal. If you match greedily, ch_002 takes the deal and ch_003 becomes `PAYMENT_NO_DEAL` — which is *wrong*. It's a duplicate charge, not an unrecorded payment. Different exception, different fix, different Slack message.

Correct approach:
1. Score every payment against every candidate deal (candidates = same normalized email)
2. Sort all pairs by score descending
3. Greedily assign, marking both sides claimed
4. Anything left over goes to the classifier — which is where duplicate detection happens, **not** in the matcher

The matcher's job is *pairing*. The classifier's job is *naming what's left*. Don't blur them.

**`src/classify.js`** — takes matcher output, produces exceptions.

- Unmatched payment + another payment same email/amount within 60 min → `DUPLICATE_CHARGE` (both, linked)
- Unmatched payment, no duplicate → `PAYMENT_NO_DEAL`
- Unmatched deal with `stage=closedwon` → `DEAL_NO_PAYMENT`
- Unmatched deal with any other stage → **ignored, not an exception.** An open deal has no payment because it hasn't closed. Flagging it would make the report useless.
- Matched pair where `payment.refunded=true` and `deal.stage=closedwon` → `ORPHAN_REFUND`
- Matched pair, confidence 60–84 → `REVIEW`
- Matched pair, amounts differ beyond tolerance → `AMOUNT_MISMATCH`

**Exit criteria:** ≥ 20 tests passing, covering every case in section 7. The matcher has never seen a real API.

---

### Phase 4 — Outputs (Days 10–11, Murad)

**`src/format.js`** — exceptions → Slack blocks and Sheet rows.

Slack message rules:
- Headline always: `N payments · M clean · X exceptions · $Y unreconciled`
- **Zero exceptions still posts.** A silent bot is indistinguishable from a broken bot. "47 payments, all reconciled, nothing to review" builds more trust than silence.
- Cap at 10 exceptions in the message, then "…and 7 more, see sheet." Slack blocks have hard limits and a 40-item message is unreadable.
- Severity ordering: `DUPLICATE_CHARGE` and `PAYMENT_NO_DEAL` first (money is wrong right now), `REVIEW` last.

Sheet rows: date, type, amount, customer, email, confidence, Stripe link, CRM link, resolved checkbox. Append only — never rewrite. If an exception already has a row (same `charge_id` + `type`), skip it. That's the Sheet-level idempotency.

Postgres: upsert on `(exception_type, charge_id, deal_id)`, updating `last_seen`. This is what makes re-runs safe. **Test it by clicking Execute twice and confirming the count doesn't double.**

---

### Phase 5 — Assembly (Days 12–14, both, together)

The two halves meet. This is the highest-risk phase — budget for it going badly.

Ahad's fetch nodes now feed Murad's Code nodes. First real run against real seeded data.

**Node order:**

1. Schedule Trigger (cron, 2am, configurable)
2. Set node — compute window start/end from trigger time
3. Stripe node → charges, with **pagination loop** (`has_more` → `starting_after`)
4. CRM node → deals, filtered by date, paginated
5. CRM node → contacts for those deals (the email lives here, not on the deal)
6. Merge
7. **Code node: normalize** ← injected from `src/normalize.js`
8. **Code node: match** ← injected from `src/matcher.js`
9. **Code node: classify** ← injected from `src/classify.js`
10. Switch — exceptions vs clean
11. Postgres — upsert exceptions, insert matches, insert run record
12. Google Sheets — append new rows
13. **Code node: format** ← injected from `src/format.js`
14. Slack — post

**Error branches on nodes 3, 4, 5, 11, 12, 14.** Each writes a `runs` row with `status='failed'` and posts a Slack message saying which step failed. **This is not decoration — it's the thing the project is demonstrating.** A workflow that dies silently at 2am is worse than no workflow.

**The day-5 rule applies here in spirit:** if Phase 5 starts and the halves don't fit, the contract was wrong. Fix the contract, not the symptoms.

**Exit criteria:** seeded data in → exactly the exceptions in `expected.json` out. Run twice → same count.

---

### Phase 6 — Hardening (Days 15–17, both)

Deliberately break things and confirm the right thing happens:

| Break | Expected |
|---|---|
| Kill Postgres mid-run | Error branch fires, Slack alert, no partial writes |
| Revoke the Stripe key | Auth error caught, named in the alert, run marked failed |
| Seed 250 charges | Pagination fetches all 250, not 100 |
| Run twice in a row | Exception count identical, `last_seen` updated |
| Empty day (zero charges) | Posts "nothing to reconcile," does not crash |
| Deal with no associated contact | Skipped with a warning, doesn't kill the run |
| Deal amount is null | Skipped with a warning |
| Charge with no email | `PAYMENT_NO_DEAL`, flagged "no email — cannot match" |
| Clock skew: charge timestamped in the future | Handled, not silently dropped |
| Slack webhook 404 | Run still completes, data still written, failure logged |

Every one of these gets a row in `LIMITATIONS.md` or a test.

---

### Phase 7 — Packaging (Days 18–19, split)

**Ahad:** `INSTALL.md`. Then test it by wiping everything and following it literally on a clean machine. If a step is missing you'll find it here, not when a client does.

**Murad:** `DECISIONS.md` — every choice and why. Why not an LLM. Why dots aren't stripped from emails. Why nightly not real-time. Why greedy assignment. **This document is portfolio gold** — it's the thing that shows a client you think, rather than just wire.

**Both:** README. The first 200 words must be readable by someone who has never heard of n8n. Lead with the problem, not the stack.

---

### Phase 8 — Ship (Days 20–21, both)

- 60-second screen capture: seed → run → Slack alert → click into Sheet → click through to the real Stripe charge. **This is the portfolio piece.** The repo proves it's real; the video is what people actually watch.
- LinkedIn post. Lead: *"Your CRM says you closed $50k last month. Your Stripe says $47k. Nobody knows where the $3k went — because nobody's looking."*
- Upwork portfolio entry, linking repo + video
- Repo public, README final

**Day 21 is a hard cap. Post whatever exists.**

---

## 7. The edge case catalogue

Every one of these needs a test. This is the section that makes the project worth building.

### 7.1 Email
| Case | Correct behaviour |
|---|---|
| `Sarah.Chen@ACME.com` vs `sarah.chen@acme.com` | Match. Lowercase both. |
| `jenna+billing@northstar.io` vs `jenna@northstar.io` | Match. Strip plus-tag. |
| `j.smith@gmail.com` vs `jsmith@gmail.com` | **Do NOT match.** Gmail ignores dots, other providers don't. Too risky. Document it. |
| Email is null on the charge | `PAYMENT_NO_DEAL`, flagged "unmatchable" |
| Email is null on the deal's contact | Skip the deal with a warning |
| Two contacts, same email, different deals | Both are candidates. Score decides. |
| Trailing whitespace | Trim before anything else |
| Unicode / IDN domains | Out of scope v1. Document. |

### 7.2 Amounts
| Case | Correct behaviour |
|---|---|
| Stripe cents vs CRM dollars | Normalize before the contract line |
| $1,940.50 vs $2,000 (2.98%) | Match at 85, flagged `fee_adjusted` |
| $1,800 vs $2,000 (10%) | `AMOUNT_MISMATCH` |
| Deal amount is null | Skip with warning, don't treat as $0 |
| Deal amount is a string `"2000"` | Coerce at normalize |
| Partial payment: $1,000 of a $2,000 deal | `AMOUNT_MISMATCH`. **Not** split-payment support — that's v2. Document. |
| Negative amount | Refund. Handle in refund logic, not as a charge. |
| Zero-amount charge | Ignore. Stripe creates these for card validation. |
| Currency mismatch (EUR charge, USD deal) | v1: skip, log as unsupported. Do not silently compare. |
| Floating point: `0.1 + 0.2 !== 0.3` | Compare with a cents-based integer or an epsilon. Never `===` on floats. |

### 7.3 Time
| Case | Correct behaviour |
|---|---|
| Charge 23:58 Jan 14, deal 00:04 Jan 15 | **Match.** 6 minutes apart. Same-calendar-day matching is wrong. |
| Deal closed 3 days after payment | Score 0 on time, may still match on email+amount = 90. Correct — CRM lag is normal. |
| Payment before the deal was created | Normal. Prepayment. Not an exception. |
| Charge timestamped in the future | Clock skew. Handle, don't drop. |
| DST transition | Everything is UTC. Non-issue by design. |
| The window itself: 00:00:00 to 23:59:59 — inclusive or exclusive? | Decide once, document, test the boundary. A charge at exactly 00:00:00.000 must not be counted twice across two runs. |

### 7.4 Hostile / structural
| Case | Correct behaviour |
|---|---|
| Two charges, one deal (Mike) | `DUPLICATE_CHARGE`, **not** `PAYMENT_NO_DEAL`. Greedy assignment gets this wrong. |
| Two deals, one charge | Match the best-scoring. Flag the other `DEAL_NO_PAYMENT`. |
| Two people named "John Smith" | Different emails → never collide. Name matching only fires when email is absent on both. |
| Refunded charge, deal still won | `ORPHAN_REFUND` |
| Partial refund ($500 of $2,000) | Match on original amount, flag `partial_refund`. Not an orphan. |
| Deal in stage "Negotiation" with no payment | **Ignore.** Not an exception. Only `closedwon` counts. |
| Deal moved to won and back to open same day | Uses current stage. Document that stage history isn't tracked. |
| Failed charge (`tok_chargeDeclined`) | Ignore entirely. No money moved. |
| Disputed charge | v1: treat as a normal charge. Document. |
| Subscription renewal, no new deal | **This will generate false `PAYMENT_NO_DEAL` exceptions.** Config option to exclude charges with a subscription ID. Document loudly — this is the #1 thing that would annoy a real client. |
| Manual/offline payment (bank transfer) not in Stripe | Will show as `DEAL_NO_PAYMENT`. Not a bug. Document. |

### 7.5 Operational
| Case | Correct behaviour |
|---|---|
| > 100 charges | Pagination loop |
| > 100 deals | Pagination loop |
| CRM rate limit 429 | Exponential backoff, max 3 retries, then fail the run cleanly |
| Stripe API down | Error branch, Slack alert, run marked failed, no partial writes |
| Postgres down | Error branch. Do not post to Slack claiming success. |
| Sheets quota exceeded | Log it, continue. Postgres has the data. Sheets is not load-bearing. |
| Workflow runs twice (manual + scheduled) | Idempotent. Upsert. |
| Workflow didn't run last night | Today's window is still yesterday. **Yesterday's exceptions are lost.** Add a `--backfill <date>` path. |
| Two instances running simultaneously | Postgres unique constraint saves you. Test it. |
| Exception resolved in the Sheet, still exists in the data | It'll re-fire tomorrow. Either honour the `resolved` flag or document that it's report-only. **Decide this explicitly.** |

---

## 8. The CRM-agnostic seam

**The rule:** the CRM is touched in exactly two places — the fetch node and the normalize function. Everything downstream sees the contract shape from section 2.

The test: `grep -ri "hubspot" src/matcher.js src/classify.js src/format.js` returns **nothing**. If it returns a hit, the seam is broken and the abstraction is fake.

Why this matters commercially: half the automation jobs on Upwork say GoHighLevel, not HubSpot. With the seam, "we use GHL" is a one-node swap and a new normalize function — a day of work you can quote for. Without it, it's a rewrite and you don't bid.

**This is not multi-CRM support.** You are not building an adapter framework, a plugin system, or a config-driven CRM registry. That's scope creep. You are building one CRM properly, behind one seam.

### CRM comparison — what changes if you swap

| | HubSpot | GoHighLevel | Pipedrive |
|---|---|---|---|
| Free tier | Yes, generous | **No — paid only** | 14-day trial |
| Auth | Private app token. Simple. | API key or OAuth. Agency vs sub-account scoping is a real gotcha. | API token. Simple. |
| Deal object | `deals`, associated to `contacts` | `opportunities`, inside a `pipeline`, tied to a `location` | `deals`, with `person_id` |
| Where's the email? | **On the contact, not the deal.** Requires a second call. | On the contact | On the person |
| Date filtering | Search API with filter groups | Query params on opportunities | Filters + `since_timestamp` |
| "Won" concept | `dealstage = closedwon` | `status = won` on the opportunity | `status = won` |
| Pagination | `after` cursor, 100/page | `startAfterId` cursor | `start` + `limit` offset |
| Rate limits | Tight on free tier | Per-location limits | Generous |
| Upwork demand | High | **Highest** | Low |
| n8n native node | Yes, good | **Community node, quality varies — may need HTTP Request** | Yes |

**Why HubSpot for the build:** free, native n8n node, good docs. You can build the whole thing without paying anyone.

**Why GHL is the money:** it's what the job posts say. But it's paid-only, so you can't develop against it for free, and the n8n node may not exist natively.

**The play:** build on HubSpot. Keep the seam clean. Then in the README write *"CRM-agnostic by design — swapping to GoHighLevel or Pipedrive means replacing one fetch node and one normalize function."* That sentence is what lets you bid on GHL jobs with a HubSpot demo. Do not build the GHL version on spec.

**If Phase 0 kills HubSpot:** Pipedrive is the fallback (trial, clean API, good node). GHL only if a paying client asks.

---

## 9. What Claude Code does, and what you do

### Claude Code writes
- `seed.py`, `teardown.py`, `scenarios.py`
- `normalize.js`, `matcher.js`, `classify.js`, `format.js`
- The entire test suite
- `build/inject.js`
- `schema.sql`, `docker-compose.yml`
- README, `INSTALL.md`, `DECISIONS.md`, `LIMITATIONS.md`
- Workflow JSON edits — **with a caveat, see below**

### Claude Code runs
- The seeder, the tests, Docker, git

### Claude Code cannot
- **Click OAuth consent screens.** Stripe, HubSpot, Google, Slack credentials are yours. One time each. Stop trying to automate it.

### Claude Code shouldn't
- **Build every n8n node for you.** You build the skeleton in the canvas by hand. You are doing this project to prove *you* know n8n. If Claude Code generates the whole workflow, a client asks "why did you use a Merge node there" and you can't answer. That's worse than not having the project.

### The workflow JSON caveat

n8n's node parameter names change between versions. Claude Code writing `workflow.json` from memory **will get them wrong**, and you'll waste hours debugging a hallucinated schema.

**The correct loop:**
1. You build the node once in the n8n UI, by hand
2. Export the workflow to JSON
3. That export is now the ground truth — Claude Code edits *that*, never invents from scratch
4. Re-import, test

### The n8n MCP server

An MCP server would let Claude Code query real node schemas and push workflows into your instance directly — closing the write→deploy→run→read-error→fix loop without you copy-pasting between terminal and browser.

Community n8n MCP servers exist. **I can't vouch for any specific one.** Phase 0 task: search, evaluate, decide. If it works, it saves real time. If it's flaky, drop it — the manual export/import loop above works fine and the project must not depend on a third-party server staying up.

### The division, in one line

**Claude Code does the code. You do the clicks and the canvas.**

---

## 10. Git — no Claude attribution

**Priority instruction: commits are yours alone. Nothing in the repo mentions Claude or Claude Code.**

By default Claude Code appends a `Co-Authored-By: Claude` trailer and a "Generated with Claude Code" line to commits. That's what puts it in GitHub's contributor list. Kill it in three places:

**1. Claude Code settings** — in `.claude/settings.json` (or the global config):
```json
{ "includeCoAuthoredBy": false }
```

**2. `CLAUDE.md`** — an explicit rule (see section 11).

**3. Git identity** — confirm the repo commits as you:
```bash
git config user.name  "Your Name"
git config user.email "your@email.com"
```

**Verify on commit #1, don't trust it:**
```bash
git log -1 --format='%an <%ae>%n%B'
```
Output must show your name and a message with no Claude reference, no `Co-Authored-By`, no `🤖`, no emoji.

If something slips through, fix it before pushing:
```bash
git commit --amend --author="Your Name <your@email.com>" -m "your message"
```

Already pushed? `git rebase -i` and reword. Painful. Check on commit #1 instead.

**Commit message style:** plain, imperative, human. `add fee tolerance to matcher scoring`. Not `feat(matcher): implement fee tolerance ✨`.

---

## 11. Session protocol

### `CLAUDE.md` — commit this at the repo root

```markdown
# Project: Reconciliation Bot

## FIRST ACTION EVERY SESSION
1. Read `progress.md` in full. It is the state of the world.
2. Read `PLAN.md` if you need scope context. PLAN.md is LOCKED — do not modify it.
3. Read `docs/CONTRACT.md`. Never change the data shape without asking.
4. State what you understand the current phase and next task to be. Wait for confirmation.

## GIT RULES — NON-NEGOTIABLE
- NEVER add "Co-Authored-By: Claude" to any commit.
- NEVER add "Generated with Claude Code" or any variant.
- NEVER mention Claude, Claude Code, AI, or an assistant in a commit message,
  code comment, PR, or documentation.
- Commits are authored solely by the repo owner.
- Commit messages: lowercase, imperative, plain. No emoji. No conventional-commit prefixes.

## SCOPE RULES
- PLAN.md is locked. If something in it seems wrong, SAY SO — do not silently deviate.
- Do not build anything not in PLAN.md. If it seems like a good idea, add it to
  progress.md under "Ideas parked" and move on.
- Non-goals are in PLAN.md section 1. Respect them. No dashboard. No LLM in the matcher.

## CODE RULES
- `src/matcher.js` is a PURE FUNCTION. No I/O, no API calls, no console.log,
  no reading the current date. Everything is an argument.
- `src/matcher.js`, `src/classify.js`, `src/format.js` must NEVER contain the
  string "hubspot", "stripe", or any vendor name. They see the contract shape only.
- `workflow/workflow.json` is GENERATED. Never hand-edit it. Edit src/*.js
  and run `npm run build`.
- Every threshold goes in config. No magic numbers.
- Every new edge case gets a test before the fix.

## LAST ACTION EVERY SESSION
Update `progress.md`. See its format. Do not skip this even if the session was short.
```

### `progress.md` — the format

```markdown
# Progress

**Last updated:** 2026-01-20 by Murad, session 7
**Current phase:** 3 — matcher
**Days elapsed:** 9 / 21

## Status
One paragraph. What state is the project actually in? Would a stranger
reading this know whether it works?

## Done
- [x] Phase 0 — spike, all 12 checks passed (see Decisions log 2026-01-14)
- [x] Phase 1 — docker compose up works, postgres schema applied
- [x] normalize.js — 8 tests passing
- [ ] matcher.js — 14/20 tests passing  <- IN PROGRESS

## Session 7 — what happened
- Implemented greedy pair assignment sorted by score
- Fixed: Mike's duplicate was landing as PAYMENT_NO_DEAL. Root cause was
  first-match-wins. Now scores all pairs, sorts, assigns.
- Added test/fixtures/hostile.json

## Problems solved (never re-solve these)
| Problem | Cause | Fix |
|---|---|---|
| Duplicate charge misclassified | Greedy first-match | Score all pairs, sort desc, assign |
| Sarah not matching | Case sensitivity | Lowercase at normalize, not in matcher |
| Amounts off by cents | Float comparison | Compare as integer cents |

## Blockers
| Blocker | Owner | Since | Needs |
|---|---|---|---|
| Google OAuth consent screen stuck in review | Ahad | day 8 | May need to cut Sheets — 2h rule |

## Next session — start here
1. Fix the 6 failing matcher tests, all in the two-deals-one-charge family
2. Do NOT start classify.js until matcher is 20/20

## Ideas parked (NOT doing, do not start)
- Web dashboard — README extensions only
- Multi-currency — v2
- GHL adapter — only if a paying client asks

## Decisions log
| Date | Decision | Reason |
|---|---|---|
| 01-14 | HubSpot over GHL | GHL is paid-only, can't develop free |
| 01-16 | Don't strip dots from emails | Only Gmail ignores them; would merge real people elsewhere |
| 01-18 | Nightly, not real-time | Reconciliation is a look-back. Real-time adds cost, no value. |
```

### Session hygiene

- **One phase per session.** Don't start Phase 4 in a Phase 3 session.
- **Both people update the same `progress.md`.** Merge conflicts here are a feature — they mean you're both touching the same thing and should talk.
- **A session that doesn't update `progress.md` didn't happen.** The next session starts blind and you pay for it twice.
- **Push at the end of every session.** The repo is the state, not your laptop.

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope creep to a dashboard | **High** | Kills the timeline | Non-goals in section 1. `CLAUDE.md` enforces. Park it in README. |
| HubSpot free tier can't filter by date | Medium | Plan rewrite | Phase 0 spike. Fallback: fetch-all + client-side filter. |
| Google OAuth eats a day | Medium | Lost time | 2-hour rule. Cut Sheets. Postgres has the data. |
| Claude Code hallucinates n8n schemas | **High** | Hours lost debugging | Never generate workflow JSON from scratch. Export from UI first. |
| Two people, 4 days of work, coordination overhead | **High** | Slower than solo | Hard contract on day 1. No shared files between halves. |
| The matcher is "good enough" at 80% and you ship it | Medium | Weak portfolio | The scorecard is binary. 5 exceptions or fail. |
| Ahad finishes Phase 2 and idles | Medium | Wasted person | A moves to Phase 6 hardening prep and INSTALL.md early |
| Day 21 arrives, it's "almost done" | **High** | Never ships | Hard cap. Post what exists. |
| Subscription renewals flood the report with false positives | Medium | Looks broken in a demo | Config flag to exclude subscription charges. Seed one to prove it. |

---

## 13. The one-page summary

**Build:** a nightly n8n workflow comparing Stripe payments to CRM deals, reporting 5 kinds of mismatch to Slack and a Sheet.

**Prove:** that you handle production reality — pagination, idempotency, timezone boundaries, fuzzy matching, error branches — not just a happy path on a canvas.

**Split:** Ahad owns everything upstream of the contract. Murad owns everything downstream. They meet at Phase 5.

**Locked:** the definition of done, the non-goals, the contract, the 21-day cap.

**Flexible:** everything else. If reality contradicts this document, reality wins — but say so out loud and write it in the decisions log.

**Ship:** day 21. Whatever exists.
