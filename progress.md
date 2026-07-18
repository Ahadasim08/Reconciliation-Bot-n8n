# Progress

**Last updated:** 2026-07-18 by Murad, session 7
**Current phase:** 2 CLOSED (Ahad) — 3 IN PROGRESS (Murad, matcher)
**Days elapsed:** 2 / 21

## Phase 0 — 12-check results
Ahad ran the upstream checks 2026-07-17 (Stripe test mode, HubSpot free tier private
app, Slack incoming webhook, Google Sheets via service account).

| # | Check | Owner | Result | Detail |
|---|---|---|---|---|
| 1 | Stripe: create charge (test mode) | Ahad | PASS | test token `tok_visa` |
| 2 | Stripe: list charges by `created` date filter | Ahad | PASS | charge returned in date window |
| 3 | Stripe: create refund | Ahad | PASS | |
| 4 | HubSpot: create contact + deal, associated | Ahad | PASS | free tier private-app token |
| 5 | HubSpot: fetch deals by date range (server-side) | Ahad | PASS | **the big one — createdate GTE/LTE search works** |
| 6 | HubSpot: fetch contact from deal (email join key) | Ahad | PASS | **email lives on contact, join confirmed** |
| 7 | Slack: post via incoming webhook | Ahad | PASS | message appeared |
| 8 | Google Sheets: append row (service account) | Ahad | PASS | shared sheet with SA email as Editor |
| 9 | docker compose up: n8n + Postgres at :5678 | Murad | PASS | |
| 10 | n8n Code node executes `return [{json:{hello:"world"}}]` | Murad | PASS | |
| 11 | Export workflow JSON: Code node JS is a string | Murad | PASS | build step depends on this |
| 12 | Re-import the exported JSON: still works | Murad | PASS | |

## Status
Phase 0 and Phase 1 CLOSED (see prior sessions). **Phase 2 (seeder) CLOSED —
Ahad ran `seed.py` for real against live Stripe test mode + HubSpot: Stripe
shows 47 tagged charges (46 `succeeded` + 1 declined, 1 refunded — Tom),
HubSpot shows 45 tagged deals and 45 tagged contacts. Both cross-checked
directly against the live APIs (not just trusted from `expected.json`) and
match it exactly.**

**Phase 3 (normalize + matcher, Murad) IN PROGRESS, substantial progress this
session.** All against fixtures only, no waiting on Ahad, per PLAN.md §6. Built:
`src/normalize.js` (email lowercase/trim/plus-strip without dot-stripping,
Stripe-cents/HubSpot-string amount coercion, epoch-seconds/epoch-millis
timestamp → UTC ISO8601), `src/matcher.js` (replaced the stub — real
score-all-pairs → sort-desc → greedy-claim algorithm, so Mike's two-charges-
one-deal case resolves correctly instead of first-match-wins), `src/classify.js`
(new — matcher output → the 5 exception types + REVIEW, including
DUPLICATE_CHARGE detection across the full payment set post-matching, and
AMOUNT_MISMATCH overriding plain REVIEW when the amount reason is only
`amount_within_10pct` rather than exact/fee-adjusted).

35/35 tests passing (`npm test`). Seam check clean: `grep -ri "hubspot\|stripe"`
returns nothing in `matcher.js` or `classify.js`. Not yet formally "done" against
the full §7 catalogue — several rows (currency-mismatch filtering, zero-amount
Stripe validation charges, pagination, rate-limit backoff, window-boundary
inclusivity) are operational/upstream concerns for Phase 5/6, not pure-function
matcher/classify work, and were deliberately left out this session.

## Done
- [x] docker-compose.yml written (n8n + Postgres)
- [x] Phase 0 checks 1-8 (Ahad — Stripe, CRM, Slack, Sheets) — all passed
- [x] Phase 0 check 9 — `docker compose up` → n8n loads at localhost:5678
- [x] Phase 0 check 10 — Code node `return [{json:{hello:"world"}}]` executes
- [x] Phase 0 check 11 — export workflow JSON, confirm Code node JS is a string
- [x] Phase 0 check 12 — re-import JSON, confirm it works
- [x] Phase 0 — ALL 12 CHECKS PASSED, phase closed
- [x] package.json + Vitest — `npm test` passes (3/3)
- [x] test/fixtures/clean.json — 7 charges, 6 deals, contract shape
- [x] src/matcher.js — stub, correct signature, one passing test
- [x] build/inject.js — proven against real n8n export, 2 passing tests
- [x] docker-compose.yml committed (Murad; was Ahad's PLAN.md item)
- [x] db/schema.sql — runs/exceptions/matches, UNIQUE idempotency key, type CHECKs
- [x] .env.example — all 4 credentials documented
- [x] docs/CONTRACT.md — written, transcribed from PLAN.md §2 (sign-off pending)
- [x] spike/ deleted (Phase 0 throwaway)
- [x] Load db/schema.sql into running Postgres (done S5, persists in volume)
- [x] 4 credentials stored in n8n credential store (done S5, manual UI)
- [x] docs/CONTRACT.md signed off by BOTH (done S5 — Murad reviewed, both boxes checked)
- [x] package.json/package-lock.json version mismatch fixed (S5, bb8d3ba)
- [x] seeder/scenarios.py — dataset source of truth (36 clean, 5 exceptions, 5 hostile, 1 declined)
- [x] seeder/seed.py — creates real Stripe + HubSpot records, tagged, idempotent guard, writes expected.json
- [x] seeder/teardown.py — deletes tagged HubSpot records, refunds tagged Stripe charges
- [x] Phase 2 — seeder run for real, verified against live APIs, all counts match expected.json
- [x] src/normalize.js — normalizeEmail/normalizeAmount/normalizeTimestamp, 12 tests
- [x] src/matcher.js — real scoring + greedy pair assignment (was stub), 12 tests
- [x] src/classify.js — matcher output → 5 exception types + REVIEW, 11 tests
- [ ] Phase 3 exit criteria (≥20 tests covering all of §7) — 35 tests written,
      core matcher/classify cases covered; several §7 rows are Phase 5/6 scope
      (pagination, rate limits, currency filtering) — NOT DONE, revisit next session

## Session log
### Session 1 — 2026-07-17
- Wrote `docker-compose.yml`: n8n + Postgres 16-alpine, healthcheck-gated
  startup, named volumes (`postgres_data`, `n8n_data`)
- `docker compose up -d` — image pull + start confirmed, both containers
  healthy/up
- Next: manual UI steps in n8n (owner account, Code node, export/import)

### Session 2 — 2026-07-17
- Ran Code node `return [{json:{hello:"world"}}]` in n8n UI — executed
- Exported workflow → `test-workflow.json`. Confirmed Code node's `jsCode`
  is a plain JSON string (not nested object) — checks 11
- Re-imported that JSON into n8n, confirmed it still runs — check 12
- Murad's 4 checks (9-12) all done. Ahad's 8 (Stripe/CRM/Slack/Sheets) still
  not started — this is what blocks Phase 0 exit and Phase 1 start
- `test-workflow.json` is throwaway spike output, not part of repo layout
  (see PLAN.md section 4) — delete before Phase 1, or leave until Ahad's
  checks confirm the pattern once more

### Session 3 — 2026-07-17
- Ahad confirmed all 8 spike checks passed → Phase 0 closed, all 12 green
- Started Phase 1 (Murad's half):
  - `npm init`, added Vitest, `npm test` script
  - `test/fixtures/clean.json`: 7 charges / 6 deals, contract shape,
    hand-written (David Reyes charge deliberately has no matching deal,
    per the 7/6 split PLAN.md calls for)
  - `src/matcher.js`: stub with the real signature
    `match(payments, deals, config)`, returns
    `{matched:[], review:[], unmatchedPayments:[], unmatchedDeals:[]}`
  - `build/inject.js`: `injectCode(workflow, mappings)` reads a src file's
    text into a named node's `parameters.jsCode`. Proved against the real
    Phase 0 export (re-exported by Murad as `My workflow.json`, copied into
    `test/fixtures/n8n-code-node-export.json`, root copy deleted after)
  - `npm test` → 3/3 passing
- Ahad's Phase 1 half (schema.sql, .env.example, credentials) not started

### Session 4 — 2026-07-17 (Ahad)
- Deleted throwaway `spike/` (Phase 0 closed and confirmed).
- Wrote `db/schema.sql`: `runs` / `exceptions` / `matches` per PLAN.md §6, plus
  CHECK constraints enforcing the 5 exception types and the `status` enum, and
  indexes on run_id / resolved / email. Could NOT live-load it — Docker isn't
  installed on Ahad's machine.
- Wrote `.env.example`: Postgres (mirrors compose) + the 4 API creds, with a note
  that the API creds go into n8n's credential store, not this file.
- Wrote `docs/CONTRACT.md`: payment/deal input shapes, matcher output shape, the 5
  exception types, contract rules, and a sign-off block (both boxes still unchecked).
- Verified `npm test` green (3/3). Discarded an incidental `package-lock.json`
  mutation from `npm install` (it pruned cross-platform optional deps) to keep
  Murad's lockfile intact.
- Committed + pushed (12fe273). Repo pushed to github.com/Ahadasim08/Reconciliation-Bot-n8n.

### Session 5 — 2026-07-18 (Ahad + Murad, concurrent)
- Ahad: installed Docker Desktop on his machine — the blocker from S4. Brought
  the stack up (n8n + Postgres at :5678), loaded `db/schema.sql` into the
  running Postgres (runs/exceptions/matches tables created, persist in
  `postgres_data`).
- Ahad: stored all 4 API credentials via the n8n UI: Stripe (`sk_test_`),
  HubSpot (`pat-`), Google Sheets (service-account JSON). Slack is an
  incoming-webhook URL, saved for the HTTP node in Phase 4/5 — not a stored
  credential type.
- Ahad: HubSpot detour — private apps were moved into the "Legacy Apps" area
  of the new developer platform. Old Phase 0 app was gone; created a fresh
  one with scopes `crm.objects.deals.read` + `crm.objects.contacts.read`,
  copied the `pat-` token.
- Murad reviewed `docs/CONTRACT.md`; both sign-off boxes checked. Fixed an
  accidental broken-line edit (`clean.jso` → `clean.json`). **Phase 1 CLOSED.**
- Ahad: caught + reverted real API keys accidentally pasted into
  `.env.example` (a git-TRACKED file) before any commit — see Problems
  solved. No exposure.
- Murad (independently, on his own already-running containers): loaded
  `db/schema.sql` into his instance too (`runs`/`exceptions`/`matches`
  confirmed via `\dt` — harmless, `CREATE TABLE IF NOT EXISTS`), and fixed
  the package.json (0.1.0) vs package-lock.json (1.0.0) version mismatch by
  hand-editing the lock's two version fields (avoids the known
  optional-deps-prune problem from `npm install`). `npm test` stayed green
  (3/3). Committed `bb8d3ba`.
- Both pushed concurrently — Ahad's close-out (`5933f59`) and Murad's
  (`bb8d3ba` + `a852ca9`) diverged on `progress.md`. Rebased Murad's on top
  of Ahad's; resolved in favor of Ahad's fuller close-out, folding in the
  package-lock fix.

### Session 6 — 2026-07-18 (Ahad)
- Built `seeder/scenarios.py`: single source of truth for the dataset. 36
  clean customers (name/company generated deterministically, seed=42), the 5
  planted exceptions from PLAN.md §6 (Mike duplicate, David payment-no-deal,
  Priya deal-no-payment, Tom orphan-refund, Jenna amount-mismatch→review),
  the 4 hostile must-match cases (Sarah casing, Jenna plus-tag, Raj midnight,
  two John Smiths) plus one declined charge (`tok_chargeDeclined`).
- Design call: Stripe charges can't be backdated — `created` is always the
  real API-call time. Rewrote the whole scenario model around an `anchor`
  (the actual run time) with minute offsets resolved at build time, instead
  of PLAN.md's illustrative fixed Jan-14 date. HubSpot deal `closedate` has
  no such restriction and is set directly.
- Built `seed.py`: creates Stripe charges (metadata-tagged) and HubSpot
  contacts+deals (tag lives in `jobtitle`/`dealname` prefix — no custom
  property needed, avoids requiring `crm.schemas.deals.write`). Idempotency
  guard searches for any existing seed-tagged deal before creating; `--force`
  bypasses it. `--dry-run` prints without touching the network. Writes
  `expected.json` — the scorecard.
- Built `teardown.py`: HubSpot contacts/deals are truly deleted via the API.
  Stripe test charges are NOT deletable through the API (Stripe's own
  limitation) — teardown refunds any unrefunded tagged charges instead;
  documented in the module docstring, not a gap in the script.
- Blocker hit and resolved: HubSpot token from S5 only had read scopes
  (`crm.objects.deals.read` + `crm.objects.contacts.read`). Seeder needs
  write. User added `crm.objects.contacts.write` + `crm.objects.deals.write`
  in the private-app settings, re-copied the token into both n8n's
  credential store and `.env`.
- Ran `seed.py` for real. Cross-checked directly against both live APIs
  (not just trusting `expected.json`): Stripe shows 47 tagged charges (46
  `succeeded` + 1 `failed`/declined, 1 refunded — Tom), HubSpot shows 45
  tagged deals and 45 tagged contacts. Both match `expected.json` exactly.
- Committed `seeder/` (`2135584`). Rebased onto Murad's concurrent
  session-5 close-out (`43e55e9`) before pushing — clean, no conflicts.

### Session 7 — 2026-07-18 (Murad)
- Pulled Ahad's Phase 2 seeder push (752fd5e) at session start — fast-forward,
  no conflicts with the untracked files already being worked on.
- `src/normalize.js`: `normalizeEmail` (trim → lowercase → strip plus-tag,
  deliberately does NOT strip dots per PLAN.md §7.1), `normalizeAmount`
  (Stripe cents / HubSpot string → dollars number, null passes through as
  null, never coerced to 0), `normalizeTimestamp` (Stripe epoch-seconds /
  HubSpot epoch-millis → UTC ISO8601). 12 tests.
- `src/matcher.js`: replaced the Phase 1 stub with the real algorithm from
  PLAN.md §6 — score every payment against candidate deals (same normalized
  email, or name-fuzzy only when both sides lack an email), sort all pairs by
  score descending, greedily claim. Fixes the Mike two-charges-one-deal case:
  the losing charge now falls through to the classifier as a candidate
  duplicate instead of the matcher wrongly calling it unmatched-and-done.
  Scoring config (thresholds, points per signal) is fully in `config`, merged
  over defaults — no magic numbers in the function body. 12 tests, including
  the Jenna fee-tolerance case (confidence exactly 85, matching PLAN's worked
  example) and the timezone-boundary hostile case (23:58/00:04 still matches).
- `src/classify.js` (new file): takes matcher output, produces the 5 exception
  types + REVIEW. Key decision: DUPLICATE_CHARGE detection compares each
  unmatched payment against ALL payments (matched + review + unmatched), not
  just other unmatched ones — necessary because the matcher already claimed
  one of the two duplicate charges into `matched`, so the leftover charge has
  to be compared against the winner, not against itself. AMOUNT_MISMATCH
  overrides plain REVIEW when the only amount signal was `amount_within_10pct`
  (not exact/fee-adjusted), matching the §7.2 table's "$1,800 vs $2,000 (10%)
  → AMOUNT_MISMATCH" case exactly. Partial refunds (`refunded:false`,
  `refundedAmount>0`) deliberately do NOT trigger ORPHAN_REFUND — that's a
  Stripe semantic (their `refunded` flag is only true when fully refunded), so
  the existing check already does the right thing without extra code. 11 tests.
- `npm test`: 35/35 passing. Seam check (`grep -ri "hubspot\|stripe"` against
  `matcher.js`/`classify.js`) returns nothing — confirmed clean both files.
- Did not touch: `format.js` (Phase 4), any n8n Code/Switch/output nodes
  (Phase 5), Ahad's seeder internals.

## Problems solved (never re-solve these)
| Problem | Cause | Fix |
|---|---|---|
| `git push` → 403 "denied to ai-and-beyond" | Windows credential manager cached a different GitHub account | Push via gh's helper: `git -c credential.helper= -c credential.https://github.com.helper='!gh auth git-credential' push`. Long-term: clear the stale cred from Windows Credential Manager. |
| `npm install` rewrites package-lock.json | npm prunes other-platform optional native deps on install | Don't commit that diff — `git checkout -- package-lock.json`. Lockfile stays cross-platform. |
| Real API keys pasted into `.env.example` | `.env.example` is git-TRACKED (`.gitignore` allows it via `!.env.example`) — it's the placeholder template, not a secret file | `git checkout -- .env.example` to restore `xxx` placeholders BEFORE commit. Real keys live only in n8n's credential store. Caught pre-commit S5, never pushed, no rotation needed. If the editor tab still holds them, close without saving. |
| package.json (0.1.0) vs package-lock.json (1.0.0) mismatch | lock still had the `npm init` default version, never updated when package.json was set to 0.1.0 | Hand-edited both `version` fields in package-lock.json to 0.1.0 (not `npm install`, to avoid the optional-deps prune above). Commit bb8d3ba. |
| HubSpot token had read-only scopes, seeder needs to create records | S5 only obtained `crm.objects.deals.read` + `crm.objects.contacts.read` (fetch-only, correct for Phase 5 but not Phase 2) | Added `crm.objects.contacts.write` + `crm.objects.deals.write` to the same private app, re-copied token into n8n credential store + `.env`. |
| Stripe charges can't carry the planned Jan-14 demo date | `created` is server-set at API-call time, not client-settable | Redesigned scenarios.py around an `anchor` (actual run time) with minute offsets, not a fixed calendar date. HubSpot `closedate` is set directly since it has no such restriction. |
| `python -c "c.metadata.get(...)"` raised `AttributeError: get` on a StripeObject | Stripe SDK's `StripeObject.__getattr__` doesn't proxy `.get()` the way a plain dict does | Use `c['metadata']` subscript access (or `'seed' in md`), not `.get()`, when poking at Stripe objects ad hoc. |

## Blockers
None.

## Next session — start here
Phase 2 CLOSED (Ahad). Phase 3 (matcher, Murad) is IN PROGRESS — continue it,
do not jump to Phase 4.
1. Decide if Phase 3 exit criteria are actually met: PLAN.md §6 wants ≥20 tests
   covering every case in §7. We have 35 tests but haven't audited them row-by-row
   against the §7 catalogue (7.1–7.5). Do that audit first — list which §7 rows
   are genuinely uncovered vs. which are correctly out of scope (operational/
   Phase 5-6 concerns like pagination, rate limits, currency filtering).
2. Likely remaining gaps worth a look: two-contacts-same-email-different-deals
   (7.1), "deal moved to won and back same day" (7.4), 3+ way duplicate charges.
3. Once Phase 3 is genuinely done, next is Phase 4 — `src/format.js` (Murad):
   exceptions → Slack blocks + Sheet rows. Don't start it before Phase 3 closes.
4. Ahad's seeder (Phase 2) was verified against live Stripe + HubSpot this
   session (see Decisions log / session 6) — no further re-verification needed.

## Ideas parked (NOT doing, do not start)
- Web dashboard — README extensions only
- Multi-currency — v2
- GHL adapter — only if a paying client asks

## Decisions log
| Date | Decision | Reason |
|---|---|---|
| 2026-07-17 | Keep HubSpot as the CRM | Phase 0 checks 5 & 6 passed — free tier filters deals by date server-side and the contact→deal email join works. No need for the Pipedrive fallback (PLAN.md §8). |
| 2026-07-17 | API creds live in n8n's credential store, not `.env` | `.env.example` is the operator checklist; secrets never touch the repo. |
| 2026-07-17 | schema.sql adds CHECK constraints on exception_type/status | Enforces the documented enums at the DB layer without changing the PLAN.md §6 column shape. |
| 2026-07-18 | Seeder tags HubSpot records via `jobtitle`/`dealname` prefix, not a custom property | Avoids needing `crm.schemas.deals.write` scope just to tag test data — one fewer credential fight. |
| 2026-07-18 | Seeder dataset is anchored to real run time, not a fixed calendar date | Stripe won't let charge `created` be backdated; the demo's "day" is whichever day you actually run `seed.py`. |
| 2026-07-18 | teardown.py refunds Stripe test charges instead of deleting them | Stripe's API has no charge-delete endpoint. Refunding is the closest real cleanup; test-mode charges persisting in the dashboard costs nothing. |
| 2026-07-18 | DUPLICATE_CHARGE compares an unmatched payment against ALL payments, not just other unmatched ones | The matcher already claims one of the two duplicate charges into `matched`; the leftover has no unmatched twin to compare against, only the winner. |
| 2026-07-18 | AMOUNT_MISMATCH overrides plain REVIEW when the only amount signal is `amount_within_10pct` | PLAN.md §7.2 states 10% variance is AMOUNT_MISMATCH outright, not a soft REVIEW — confidence banding alone isn't enough, the classifier reads matcher reasons. |
