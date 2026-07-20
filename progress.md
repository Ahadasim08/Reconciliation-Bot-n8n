# Progress

**Last updated:** 2026-07-20 by Murad, session 9
**Current phase:** 5 — assembly (both). Nodes 1-14 built and wired, Postgres branch
verified with a clean run (`runs.status='ok'`, 12 exceptions logged, no duplicate
inserts). Re-seeding now to check the 12-vs-5-expected discrepancy.
**Days elapsed:** 4 / 21

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

**Phase 3 (normalize + matcher, Murad + Ahad) CLOSED this session.**
Subscription-exclusion (§7.4) resolved — `subscriptionId` added to the
contract, `classify.js` skips `PAYMENT_NO_DEAL` for renewals, config-gated.
Zero-amount Stripe filtering (§7.2) remains deliberately deferred to Phase 5
(fetch-node scope, not pure-function). Everything else in §7 that's
matcher/classify-relevant is covered.

**Phase 5 (assembly) IN PROGRESS.** Ahad built n8n canvas nodes 1-6 by hand
(Schedule Trigger → window Set → Stripe fetch+filter → HubSpot deals
fetch+filter → contact join → merges), fixed real bugs found along the way
(cron field, filter type mismatches, three wiring mistakes, a window-vs-
fresh-seed-data timing issue), exported as `workflow/workflow.template.json`
and pushed so Murad's `build/inject.js` can inject his Code-node logic into
it. `docs/INSTALL.md` drafted (steps 1-4 accurate now, 5-8 assume the
finished `workflow.json`). Resolved the `resolved`-flag decision (report-
only, see Decisions log — Murad landed on the same call independently same
day). Two `seeder/teardown.py` bugs fixed (`.get()` on a StripeObject,
refunding an unpaid declined charge) and `expected.json` regenerated.
Waiting on Murad to push nodes 7-14 before continuing (error branches on
nodes 3/4/5, wiring node 6 → his first Code node, Postgres/Sheets nodes,
full assembly test).

**Phase 4 (outputs, Murad) CLOSED prior session — `src/format.js` written:**
`formatSlackMessage` (headline + severity-sorted, capped exception list, posts
even at zero exceptions per PLAN.md), `formatSheetRows` (exception → sheet row
shape), `summarize` (the headline's numbers). `docs/CONTRACT.md` updated with
`format.js`'s output shape so Ahad has it before Phase 5.

Caught and fixed a seam violation before committing — the sheet-row field
names `stripeLink`/`crmLink` had a vendor string in one of them, renamed both
to `paymentLink`/`dealLink`. A background security review of the push then
caught two real bugs that slipped past that first pass: CSV formula
injection (a customer name starting with `=`/`+`/`-`/`@` runs as a formula
when the Sheet is opened) and Slack mrkdwn injection (unescaped `&`/`<`/`>`
in a customer name can forge a fake link or break block rendering). Both are
attacker-influenceable — the name is whatever the customer typed at
checkout. Fixed: sheet rows prefix a leading quote on formula-looking
values, Slack lines escape mrkdwn's three special characters. 3 more tests.

Resolved the one deliberately-open design question (PLAN.md §6's "decide
explicitly" on the `resolved` flag): report-only for now — the Sheet
checkbox is a human todo marker, not read back by the system, so an
exception re-fires nightly regardless until the underlying Stripe/HubSpot
data actually changes. Logged in Decisions log, noted inline in `format.js`.
Honouring it for real needs Phase 5/6 plumbing (Postgres mirrors resolved,
or the workflow reads the Sheet back) that doesn't exist yet.

21 new tests this phase, 55/55 total. Seam check
(`grep -ri "hubspot\|stripe"` across `matcher.js`/`classify.js`/`format.js`)
still clean. Not yet done, correctly out of `format.js`'s scope: Postgres
upsert / Sheet-row idempotency (Phase 5 n8n-node wiring) and Slack
block-kit's real 50-blocks-per-message limit (verify once the HTTP node
exists in Phase 5).

Detail on the matcher/classify work from session 7:
`src/normalize.js` (email lowercase/trim/plus-strip without dot-stripping,
Stripe-cents/HubSpot-string amount coercion, epoch-seconds/epoch-millis
timestamp → UTC ISO8601), `src/matcher.js` (replaced the stub — real
score-all-pairs → sort-desc → greedy-claim algorithm, so Mike's two-charges-
one-deal case resolves correctly instead of first-match-wins), `src/classify.js`
(new — matcher output → the 5 exception types + REVIEW, including
DUPLICATE_CHARGE detection across the full payment set post-matching, and
AMOUNT_MISMATCH overriding plain REVIEW when the amount reason is only
`amount_within_10pct` rather than exact/fee-adjusted).

**Audited all 35 tests against the PLAN.md §7 edge-case catalogue row by row.**
Found and fixed 3 real logic gaps (not just missing tests): a closedwon deal
with no email was wrongly firing `DEAL_NO_PAYMENT` instead of being skipped; the
matcher never checked currency, so a EUR charge could silently score-match a
USD deal; and amounts off by more than the 10% tier (e.g. a 50% partial
payment) contributed nothing to `reasons`, so `classify.js` couldn't tell
"amount is way off" from "amount data missing" and produced a bare `REVIEW`
instead of `AMOUNT_MISMATCH`. All three fixed test-first. 41/41 tests passing
now. Seam check still clean: `grep -ri "hubspot\|stripe"` returns nothing in
`matcher.js` or `classify.js`.

One gap from that audit is deliberately NOT fixed yet — see Decisions log:
zero-amount Stripe charge filtering is Phase 5 fetch-node territory, needs a
real Stripe charge object that doesn't exist in pure-function scope. Everything
else in §7 is either covered or correctly out of scope (pagination, rate-limit
backoff, window-boundary inclusivity — Phase 5/6, not pure-function work).

**Subscription-exclusion resolved this session (Ahad + Murad, live conversation).**
Added `subscriptionId` to the payment contract shape (`null` for one-off,
Stripe subscription ID string for a renewal) — both signed off in
`docs/CONTRACT.md`. `classify.js` now skips `PAYMENT_NO_DEAL` for any
unmatched payment with `subscriptionId != null`, gated behind
`excludeSubscriptions` (defaults `true`). Ahad's Stripe fetch node (Phase 5,
not built yet) is responsible for actually populating the field — until then
it's always `null` in fixtures, a no-op for the exclusion logic. 3 new tests.
44/44 total. **Phase 3 formally CLOSED.**

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
- [x] src/matcher.js — real scoring + greedy pair assignment (was stub), currency
      guard, amount_mismatch tagging — 41 tests total across all three files
- [x] src/classify.js — matcher output → 5 exception types + REVIEW, null-email
      deal skip, AMOUNT_MISMATCH on amount_mismatch reason
- [x] Audited all tests against PLAN.md §7 catalogue row by row — 3 real bugs
      found and fixed (see Problems solved); 2 gaps logged, not fixed
      (subscription exclusion — needs contract change; zero-amount Stripe
      charge filtering — Phase 5 scope)
- [x] Phase 3 exit criteria (≥20 tests covering all of §7) — 44 tests, every
      matcher/classify-relevant §7 row covered or explicitly logged as out of
      scope. Subscription-exclusion resolved (contract updated, both signed
      off). Zero-amount Stripe charge filtering explicitly deferred to Phase 5.
      **Phase 3 CLOSED.**
- [x] src/format.js — formatSlackMessage, formatSheetRows, summarize —
      17 tests, plus CSV-formula-injection and Slack-mrkdwn-injection fixes
      caught by security review (4 more tests)
- [x] docs/CONTRACT.md — added format.js output shape addendum
- [x] `resolved`-flag semantics decided: report-only (see Decisions log)
- [x] Phase 4 exit — **CLOSED.** Postgres upsert double-Execute idempotency
      is Phase 5 territory (needs real nodes), everything within
      `format.js`'s own scope is done and tested.
- [x] n8n canvas nodes 1-6 built (Schedule Trigger, window Set, Stripe
      fetch+filter, HubSpot deals fetch+filter, contact join, two merges)
- [x] `workflow/workflow.template.json` exported and pushed (verified no
      secret values, only credential name references)
- [x] `docs/INSTALL.md` drafted and pushed (steps 1-4 accurate, 5-8 pending
      final workflow.json)
- [x] `seeder/teardown.py` bugs fixed (`.get()` on StripeObject, refunding
      an unpaid declined charge), `expected.json` regenerated

**Phase 5 in progress (session 9, Murad).** Pulled Ahad's nodes 1-6 export
(`workflow/workflow.template.json`). Built nodes 7-14 by hand in n8n: `Normalize`,
`Match`, `Classify` (Code), `Insert Run` → `Attach Run Id` → `Split Out` →
`Upsert Exception` and `Attach Run Id` → `Split Out Matched` → `Insert Match`
(Postgres logging branch), `Format` → `Slack` and `Format` → `Split Out Sheet Rows`
→ `Append row in sheet` (output branch), plus `Mark Run Failed` / `Failure Alert`
error path. Full graph diagrammed in `workflow/ARCHITECTURE.md` (working note,
not part of the locked repo layout).

Fixed a real gap in `build/inject.js` before any of this could run: it dumped
`src/*.js` verbatim into a Code node's `jsCode`, including the `export` keyword
— n8n's Code node sandbox isn't a module context, so that's a guaranteed
syntax error the first time it executes. Added `stripExports` plus an optional
`driver` snippet appended per node (the glue that actually calls
`normalize`/`match`/`classify`/`format` with n8n's `$input`, since the pure
src files don't call themselves). Test-first, 56/56 passing. Driver snippets
live in `build/drivers/*.js`; `build/build.js` is the new `npm run build`
entrypoint wiring all 4 into `workflow.template.json` → `workflow.json`.

Caught and fixed two real bugs while wiring the canvas:
- Ahad's `Merge1` was `combineByPosition` on charges vs. deals — two
  unrelated, differently-sized arrays; that zips `charge[i]` with `deal[i]`
  garbage. Fixed to `Append`. `Normalize`'s driver also sidesteps trusting
  Merge1's shape entirely — it reads `$('Filter')`, `$('Filter1')`,
  `$('Get a contact')` directly by node name.
- The `exceptions` table's `UNIQUE (exception_type, charge_id, deal_id)`
  breaks idempotency for `DEAL_NO_PAYMENT`/`PAYMENT_NO_DEAL` rows: Postgres
  treats `NULL != NULL`, so `ON CONFLICT` never matches when one of those ids
  is null, meaning a re-run would insert a fresh duplicate every night instead
  of updating `last_seen`. Fixed at the insert-parameter level (`payment?.id
  || ''` instead of `|| null`) rather than touching the schema.

First live execution run against real seeded data: `Normalize → Match →
Classify → Format` chain ran clean, `Append row in sheet` wrote 12 rows,
`Slack` posted. Real proof the matcher/classify/format pipeline works against
live Stripe/HubSpot data, not just fixtures. **Blocked:** `Insert Run` failed —
`relation "runs" does not exist` — `db/schema.sql` isn't loaded into whichever
Postgres instance this n8n's credential currently points at (loaded in S5, but
that container/volume may have been recreated since). Everything downstream of
`Insert Run` (`Attach Run Id`, `Split Out`, `Upsert Exception`, `Split Out
Matched`, `Insert Match`, `Mark Run Failed`) never ran as a result — its error
output correctly routed straight to `Failure Alert`, skipping `Mark Run Failed`
(no run row exists yet to update), which is the intended design.

Also caught (background security review, before any commit): the exported
`workflow.template.json`/`workflow.json` have the real Slack incoming-webhook
URL hardcoded in the `Slack` HTTP Request node's `url` field. Neither file is
committed yet (confirmed via `git status`), so nothing's been pushed, but this
repo goes public per PLAN.md §3/§9 — needs switching to `{{ $env.SLACK_WEBHOOK_URL }}`
before any commit, and the webhook should be rotated as good hygiene regardless.

One more thing noted, not yet investigated: `Append row in sheet` wrote 12
rows, but `expected.json` plants exactly 5 exceptions. Could be legitimate
(re-seeding without `teardown.py` between sessions accumulates records within
the lookback window) or a real classify/window bug — needs the Postgres branch
working first (so `runs`/`matches` counts can be cross-checked) before digging in.

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
- **Audit pass:** went through PLAN.md §7 (7.1–7.5) row by row against the 35
  tests. Found 3 real logic gaps, not just missing coverage — fixed all three
  test-first:
  - `classify.js` fired `DEAL_NO_PAYMENT` for a closedwon deal with a null
    email (contact join failed). PLAN §7.1 says skip with a warning, not flag
    as an exception. Fix: added `&& deal.email` to the condition.
  - `matcher.js` never checked `currency` — a EUR charge could silently
    score-match a USD deal on email+amount alone, which §7.2 explicitly
    forbids ("do not silently compare"). Fix: `scorePair` now returns `null`
    immediately on any currency mismatch, before any other scoring.
  - Amounts beyond the 10%-tolerance tier (e.g. a 50% partial payment)
    contributed 0 to score with no `reasons` entry at all — indistinguishable
    from "amount data missing." `classify.js` could then only label it plain
    `REVIEW`, not `AMOUNT_MISMATCH`, contradicting §7.2's partial-payment row.
    Fix: `matcher.js` now tags `amount_mismatch` whenever amount data exists
    but clears no tolerance tier; `classify.js` treats that the same as
    `amount_within_10pct`.
  - Two items audited but NOT fixed this session (see Decisions log):
    subscription-exclusion (needs a contract field, cross-team decision) and
    zero-amount Stripe validation charges (Phase 5 fetch-node territory).
  - 41/41 tests passing after fixes.

### Session 8 — 2026-07-18 (Ahad)
- Pulled Murad's session-7 push (`f157561`) — his audited `normalize.js` /
  `matcher.js` / `classify.js` (41 tests) plus the `refunded`-semantics
  contract addendum. Fast-forward, no conflicts.
- Note on how this session's earlier attempt went: I had independently
  written my own competing `normalize.js`/`matcher.js`/`classify.js` in
  parallel with Murad (same day, same phase, neither aware of the other).
  Pushed mine first; Murad's push landed seconds later and included a
  proper audit against PLAN.md §7 that found real bugs in *my* version too
  (duplicate-detection only scanning `unmatchedPayments` misses Mike's case
  once the matcher legitimately claims one charge; amount-mismatch
  reclassification only ran on the `matched` bucket, never `review`, so the
  plan's own $1,800/$2,000 worked example never fired; no currency check at
  all). His merge kept his side over mine — correctly. My own accusation
  that his version mishandled partial refunds didn't hold up either: Stripe's
  `refunded` field is fully-refunded-only by definition, which his code
  already assumed correctly.
- Talked to Murad directly (not through this session) and agreed on the
  subscription-exclusion contract change. Added `subscriptionId` to the
  payment shape in `docs/CONTRACT.md`, both signed off. Implemented the skip
  in `classify.js` (`excludeSubscriptions` config flag, defaults on), 3 new
  tests. Also added `subscriptionId: null` to `test/fixtures/clean.json`'s
  payments for contract consistency.
- 44/44 tests passing. Seam check still clean. **Phase 3 formally closed.**
- Post-close: considered starting Phase 5 canvas work (fetch nodes) ahead of
  Murad's Phase 4. Decided against building/injecting the full workflow
  early — `build/inject.js` needs `format.js` to exist, and PLAN.md marks
  Phase 5 as "both, together." Ahad will wait for Murad's `format.js` before
  touching the n8n canvas skeleton (nodes 1-6 are fair game solo per PLAN
  §5's risk register — "moves to Phase 6 hardening prep and INSTALL.md
  early" — but not started this session).

### Session 8 — 2026-07-18 (Murad, concurrent with Ahad above)
- Reviewed session 7's two open Phase 3 items (subscription-exclusion,
  zero-amount filtering) with the user — both stay deliberately deferred
  (cross-team contract change / Phase 5 scope respectively), nothing new to
  resolve. Formally closed Phase 3 on that basis.
- Started Phase 4: wrote `src/format.js` — `formatSlackMessage` (headline
  string, severity-sorted exception lines capped at `config.maxExceptionsInMessage`
  with a "…and N more, see sheet" line, always posts even at zero exceptions
  per PLAN.md's "silent bot is a broken bot" rule), `formatSheetRows`
  (exception → sheet row shape: date/type/amount/customer/email/confidence/
  paymentLink/dealLink/resolved), `summarize` (totals + unreconciled-amount
  math shared by both).
- Caught a seam violation before committing: the sheet row's link fields were
  named `stripeLink`/`crmLink` — `stripeLink` put a vendor string directly
  into `format.js`, which CLAUDE.md forbids. Renamed both to
  `paymentLink`/`dealLink`. Re-ran the `grep -ri "hubspot|stripe"` seam check
  against all three files (`matcher.js`, `classify.js`, `format.js`) — clean.
- Wrote `test/format.test.js` — 14 tests (zero-exception headline, severity
  ordering, cap-and-truncate message, sheet row shape for payment+deal /
  payment-only / deal-only exceptions). `npm test` → 52/52 passing.
- Updated `docs/CONTRACT.md` with `format.js`'s output shape (Slack blocks +
  sheet row shape) so Ahad has it ahead of Phase 5 assembly.
- Did not touch: Postgres upsert logic or Sheet-level idempotency (same
  charge_id+type skip) — that's Phase 5 n8n-node wiring, not `format.js`'s
  job; `format.js` always emits exactly one row per exception it's handed.
- Note: written against the 41-test base from session 7, before Ahad's
  concurrent subscription-exclusion push (44 tests) merged in — see combined
  count in Status above and re-run after this merge.

### Session 9 — 2026-07-20 (Ahad)
- Read progress.md/CLAUDE.md, confirmed Murad's Phase 4 push landed, decided
  Phase 5 canvas work (nodes 1-6) could start solo without waiting further.
- Resolved the `resolved`-flag decision (see Decisions log) before starting
  canvas work.
- Built n8n canvas nodes 1-6 by hand via screen-share/screenshots (Claude
  Code can't touch the n8n canvas directly — user-driven, Claude guided):
  Schedule Trigger, Edit Fields (window Set, Luxon `$now.minus({days:1})`
  yesterday window), Stripe "Get many charges" + Filter (client-side, since
  this n8n version's native nodes have no server-side date filter), HubSpot
  "Get many deals" + Filter1 (same reason), "Get a contact" (email join),
  Merge (deal+contact, Combine-by-Position) → Merge1 (+ payments, Append
  mode, since normalize/matcher.js does the real pairing downstream).
- Bugs fixed along the way: literal comment text left in the cron field;
  Filter node conditions defaulting to string "is equal to" instead of
  numeric >=/<; three wiring mistakes (HubSpot deals wrongly chained after
  the Stripe filter — would've re-fetched deals 9x; Merge fed the same
  Filter1 output on both inputs instead of contact-joined data; Merge1
  combined the wrong two branches, dropping payments entirely) — all caught
  from canvas screenshots and error messages, fixed by rewiring.
- Re-ran `seed.py` (fresh batch `seed:batch-1784366430`) before the real
  assembly test. Hit `AttributeError: 'get'` and an unpaid-charge refund
  crash in `teardown.py` — both fixed (see Problems solved), re-ran.
- Diagnosed all-9-payments-showing-refunded as a window issue, not a refund
  bug: freshly-seeded charges are timestamped "today," the window queries
  "yesterday," so the canvas was showing stale leftover charges from a prior
  batch. Left the window logic alone (production-correct) rather than
  loosening it to pass a local eyeball test.
- Copied the n8n export to `workflow/workflow.template.json`, verified via
  grep no secret values leaked (only credential name references), committed
  and pushed so Murad's `build/inject.js` has something to inject into.
- Drafted and pushed `docs/INSTALL.md` (clone → docker compose up → schema
  load → credentials → import → activate, plus optional seeder step and a
  troubleshooting table) while waiting on Murad's nodes 7-14.
- Explained to the user what Murad needs to do for his own HubSpot
  credential (add it fresh to his own n8n instance, re-select on the
  imported deal/contact nodes — credential bindings don't survive
  cross-instance import, only the name reference does) and flagged sharing
  the token via a private channel, never chat/commit.
- Did not start: error branches on nodes 3/4/5 (explained the pattern,
  paused before building — waiting for Murad's push first to avoid
  re-exporting a divergent template mid-flight).

### Session 9 — 2026-07-20 (Murad)
- Pulled Ahad's `df9099a` (nodes 1-6 export). Built nodes 7-14 by hand in n8n
  per PLAN.md §5 ownership: `Normalize`/`Match`/`Classify`/`Format` (Code),
  `Insert Run`/`Upsert Exception`/`Insert Match` (Postgres), `Split Out` +
  `Split Out Matched` + `Split Out Sheet Rows` (core), `Append row in sheet`
  (Sheets), `Slack` (HTTP Request, incoming webhook — not the Slack
  credential node), `Mark Run Failed`/`Failure Alert` error path. Full graph
  in `workflow/ARCHITECTURE.md`.
- Fixed `build/inject.js`: was dumping `export function ...` verbatim into
  Code nodes, a guaranteed syntax error in n8n's non-module sandbox. Added
  export-stripping + optional per-node `driver` snippet (the n8n-specific
  glue calling into each pure src file). Test-first, 56/56 passing.
  `build/drivers/*.js` + new `build/build.js` entrypoint; `npm run build`
  now targets that instead of the old bare `inject.js`.
- Fixed two real bugs found while wiring: `Merge1` was `combineByPosition`
  zipping unrelated charges/deals arrays (switched to `Append`; `Normalize`'s
  driver also reads `$('Filter')`/`$('Filter1')`/`$('Get a contact')` directly
  rather than trusting Merge1's shape at all); and the `exceptions` table's
  `UNIQUE` constraint silently breaking idempotency for null `charge_id`/
  `deal_id` rows (Postgres `NULL != NULL` — fixed by using `''` instead of
  `null` at insert-parameter level, not a schema change).
- First live run against real seeded data: `Normalize → Match → Classify →
  Format` chain succeeded, Sheet got 12 rows, Slack posted. **Blocked:**
  `Insert Run` failed, `relation "runs" does not exist` — `db/schema.sql`
  not loaded into this session's Postgres instance. Nothing downstream of
  it ran; its error path correctly skipped `Mark Run Failed` (no run row to
  update yet) and went straight to `Failure Alert`, as designed.
- Caught (background security review) before any commit: real Slack webhook
  URL hardcoded in the `Slack` node across both `workflow.template.json` and
  `workflow.json`. Confirmed neither file is committed yet — not pushed —
  but needs switching to `{{ $env.SLACK_WEBHOOK_URL }}` before it is, plus a
  rotation as good hygiene regardless.
- Open question, not yet investigated: 12 sheet rows vs. `expected.json`'s 5
  planted exceptions. Needs the Postgres branch working (to cross-check
  `runs`/`matches` counts) before digging in — could be stale accumulated
  seed data (no `teardown.py` between sessions) or a real bug.
- Continued same session: fixed the Postgres credential/schema mismatch
  (re-loaded `db/schema.sql` via `Get-Content | docker compose exec -T`,
  PowerShell doesn't support `<` redirection), moved the Slack webhook to
  `{{ $env.SLACK_WEBHOOK_URL }}` in both workflow files plus
  `docker-compose.yml`'s `n8n` service env and restarted the container.
- Found and fixed the real `Upsert Exception` bug, three layers deep: (1) the
  `query` field had a stray `Query Parameters (comma-separated, in order):`
  line baked into the SQL text itself (pasted in by mistake, never just a
  comment) — syntax error; (2) `queryReplacement` was a comma-joined string
  of `{{ }}` expressions, and the last one (`JSON.stringify($json)`) contains
  its own commas, desyncing the parameter split — switched to a single array
  expression (`={{ [ ... ] }}`, exactly one `=` prefix, nothing outside the
  `{{ }}`); (3) `Split Out`'s default destination field name matches the
  source field name, so each split item was shaped `{runId, exceptions: {...
  single exception...}}`, not flat — the parameter expressions needed
  `$json.exceptions.type` etc, not `$json.type`. All three fixed directly in
  `workflow.json`/`workflow.template.json` (not just live in the n8n UI) so
  re-importing doesn't lose the fix.
- Confirmed via direct psql: `runs` id=4, `status='ok'`, 12 exceptions logged,
  `Failure Alert` did not fire. Postgres branch (`Insert Run` →
  `Attach Run Id` → `Split Out` → `Upsert Exception`, `Split Out Matched` →
  `Insert Match`) works end to end for the first time this phase.
- Noted `matched: 0` on every run so far, alongside the 12-vs-5-expected
  exception count — running `teardown.py` + fresh `seed.py` next to rule out
  stale accumulated seed data before suspecting the matcher/normalize wiring.
- Committed (`4fdfafe`): `build/inject.js` export-stripping fix, `build/build.js`,
  `build/drivers/`, `workflow/workflow.template.json`, `workflow/workflow.json`,
  `workflow/ARCHITECTURE.md`, docker-compose env var. 56/56 tests passing,
  webhook secret confirmed absent from every committed file before pushing.

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
| `classify.js` flagged closedwon deals with no email as `DEAL_NO_PAYMENT` | Contact-join-failed deals (null email) were never excluded from the unmatched-deal exception check | Added `&& deal.email` guard — null-email deals are skipped, not flagged, per PLAN §7.1. |
| `matcher.js` could silently match a EUR charge to a USD deal | No currency check anywhere in `scorePair` — only email/amount/timestamp were scored | `scorePair` returns `null` immediately on any `payment.currency !== deal.currency`, before any other scoring runs. |
| Amounts >10% off were indistinguishable from missing amount data | Amount scoring only pushed a `reasons` tag for the three positive tiers (exact/fee/10%); anything worse contributed nothing, so `classify.js` had no signal to work with | `matcher.js` now tags `amount_mismatch` whenever both amounts exist but clear no tolerance tier; `classify.js` treats it the same as `amount_within_10pct` → `AMOUNT_MISMATCH`. |
| `teardown.py`: `AttributeError: 'get'` finding seed charges | Stripe SDK's `StripeObject.__getattr__` doesn't proxy `.get()` like a dict | Use `charge["metadata"]` subscript + `in` check instead of `.metadata.get(...)`. |
| `teardown.py`: `InvalidRequestError` refunding a charge | Loop tried to refund the deliberately-declined/unpaid test charge too | Added `charge.paid and` guard before the refund call — only paid charges can be refunded. |
| n8n Schedule Trigger "Invalid cron expression" | User typed the literal comment text `(2am daily)` into the cron field along with the expression | Field must contain only `0 0 2 * * *` (n8n 6-field format), no trailing comment. |
| n8n Filter node conditions defaulted to string "is equal to" | Type dropdown wasn't switched from string to Number before picking the operator | Set type to Number first, then pick >=/< as needed. |
| 9 seeded payments all showed `refunded: true` in the canvas output | Not a refund bug — the window Set node computes "yesterday," but freshly-seeded charges are timestamped "today," so the 9 items seen were stale leftovers from an older batch outside the window | Left window logic as-is (production-correct); re-seed and re-test rather than widen the test window. |
| `build/inject.js` dumped `export function` verbatim into a Code node | n8n's Code node sandbox isn't a module context — `export` is a syntax error there | `stripExports()` regex-strips `export ` at line start before writing `jsCode`; added optional `driver` snippet param for the n8n-glue code each node needs. |
| `Merge1` zipped unrelated charges/deals arrays | Set to `combineByPosition` — pairs `charge[i]` with `deal[i]`, meaningless for two independent, differently-sized collections | Switched to `Append`. `Normalize`'s driver also reads straight from `$('Filter')`/`$('Filter1')`/`$('Get a contact')` by name, not trusting the merged shape at all. |
| `exceptions` table's `ON CONFLICT` never matches for `DEAL_NO_PAYMENT`/`PAYMENT_NO_DEAL` rows | `UNIQUE (exception_type, charge_id, deal_id)` — Postgres treats `NULL != NULL`, so a null `charge_id` or `deal_id` never conflicts with itself on a re-run | Use `''` instead of `null` for the missing id at insert-parameter level (not a schema change). |
| `docker compose exec -T postgres psql ... < db/schema.sql` fails in PowerShell | PowerShell's `<` is reserved, no POSIX-style stdin redirection | `Get-Content db/schema.sql -Raw \| docker compose exec -T postgres psql -U n8n -d n8n`. |
| `Upsert Exception` Postgres node: syntax error, then "no parameter $N", then null `exception_type` | Three separate bugs stacked: a parameter-list comment pasted into the `query` field itself; `queryReplacement` built as a comma-joined string of expressions instead of one array expression (broke once a value — `JSON.stringify($json)` — contained its own commas); and the expression read `$json.type` when `Split Out`'s default destination field name actually nests the split element under `$json.exceptions` | Strip the stray comment line from `query`; set `queryReplacement` to a single `={{ [ ... ] }}` array expression (exactly one leading `=`, nothing outside the `{{ }}`); read every field as `$json.exceptions.*`. Fixed in the JSON files directly, not just live in the n8n UI, so re-importing doesn't lose it. |

## Blockers
| Blocker | Owner | Since | Needs |
|---|---|---|---|
| `Insert Run` fails: `relation "runs" does not exist` | Murad | session 9 | Re-run `db/schema.sql` against whichever Postgres instance this n8n's credential points to (container/volume may have been recreated since S5's load). Blocks the entire Postgres-logging branch and idempotency testing. |
| Slack webhook hardcoded in `workflow.template.json`/`workflow.json` | Murad | session 9 | Switch the `Slack` node's URL to `{{ $env.SLACK_WEBHOOK_URL }}`, add the env var to `.env`/docker-compose, re-export. Neither file is committed yet — fix before first commit of this work. Rotate the webhook regardless. |

## Next session — start here
**Phase 5 in progress.** Nodes 1-14 wired, both blockers from earlier this
session resolved, Postgres branch verified clean (run id=4, `status='ok'`,
12 exceptions, no duplicate-insert errors).
1. `teardown.py` + fresh `seed.py` is running/just ran — confirm it completed
   cleanly, then re-run the workflow and check whether the exception count
   still doesn't match `expected.json`'s planted 5, and whether `matched`
   is still 0. If `matched` stays 0 on a clean dataset, treat it as a real
   bug in `Match`/`Normalize`'s driver wiring, not stale data — start by
   checking what `$('Filter')`/`$('Filter1')`/`$('Get a contact')` actually
   hand to the `Normalize` driver.
2. Once exception/match counts look right: run the workflow a second time,
   confirm `runs`/`exceptions`/`matches` counts don't double — this is the
   Phase 5 exit criteria (PLAN.md §6) and the first real exercise of the
   `resolved`-flag report-only decision and the upsert idempotency key.
3. Verify `formatSlackMessage`'s block-kit output against Slack's real
   50-blocks-per-message limit once a run has enough exceptions to hit it.
4. Rotate the Slack webhook (good hygiene — it was hardcoded in files that
   existed locally for a while, even though never pushed to a public remote).
5. Get Murad's HubSpot credential value to Ahad via a private channel (not
   chat, not committed) so Ahad can add it to his own n8n instance and
   re-select it on the imported HubSpot nodes (bindings don't survive
   cross-instance import).
6. Build error branches (On Error → "Continue Using Error Output") on nodes
   3/4/5 (Stripe/HubSpot fetch, contact join) — explained, not yet built.
7. Still open, still Phase-5-fetch-node scope, not forgotten: zero-amount/
   declined-charge filtering is handled (`Normalize`'s driver, session 9) —
   real `subscriptionId` population from the Stripe API is not (still
   always `null`).
8. Finish `docs/INSTALL.md` steps 5-8 once `workflow.json` is final;
   re-export and commit the final combined workflow files.

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
| 2026-07-18 | Subscription-exclusion (§7.4) deliberately NOT implemented this session | Requires a new field on the payment contract (`subscriptionId`) — a shape change needs both people, per CLAUDE.md. Logged here instead of silently deciding the field name/shape alone. |
| 2026-07-18 | Zero-amount Stripe validation-charge filtering (§7.2) deliberately NOT implemented this session | Vendor-specific (Stripe-only) and needs a real charge object with a status/type field not yet in the contract — belongs in the Phase 5 Stripe fetch node, not the pure-function matcher/classify. |
| 2026-07-18 | Added `subscriptionId` (nullable) to the payment contract shape | Only way `classify.js` can distinguish a subscription renewal from a genuine untracked payment. Agreed live between Ahad and Murad, both signed off in `docs/CONTRACT.md`. Populating the real value is Ahad's Phase 5 fetch-node work. |
| 2026-07-18 | Sheet `resolved` checkbox is report-only, NOT honoured by the workflow | Honouring it means reading the checkbox back out of Sheets into Postgres — a sync loop, extra infra, and Sheets is explicitly non-load-bearing per PLAN.md §3. The underlying data condition hasn't changed just because a human checked a box, so the exception correctly re-fires every run. Resolves PLAN.md §7.5's "decide this explicitly." Ahad and Murad independently landed on this same call same day. |
| 2026-07-20 | Zero-amount + declined-charge filtering (§7.2/§7.4) done in `Normalize`'s n8n driver, not `src/normalize.js` | This is genuinely Stripe-shape-aware logic (`c.status`, `c.amount`) — belongs in the fetch-node-adjacent glue that's allowed to know vendor shapes, not the pure contract-shape function. Closes the item that had been carried since Phase 3's audit. |
| 2026-07-20 | `Normalize` Code node reads `$('Filter')`/`$('Filter1')`/`$('Get a contact')` directly instead of consuming `Merge1`'s combined item | Sidesteps depending on `Merge1`'s combine mode being correct at all — more robust regardless of how the upstream merge is configured, and avoids re-guessing HubSpot's nested legacy-API property shape twice. |
| 2026-07-20 | Postgres `exceptions` idempotency key uses `''` not `null` for a missing `charge_id`/`deal_id` | `UNIQUE` constraints treat `NULL != NULL` in Postgres, so a null id would never trigger `ON CONFLICT` and re-runs would duplicate `DEAL_NO_PAYMENT`/`PAYMENT_NO_DEAL` rows nightly. Fixed at the query-parameter level to avoid an `ALTER TABLE` this late. |
