# Limitations

Honest list of what this bot doesn't handle, plus the Phase 6 hardening
results — one row per PLAN.md §"Phase 6" break scenario. Rows with a test
are covered in `test/`; rows without one were verified live against the
real Docker/Stripe/HubSpot/Slack stack (session, 2026-07-25) and are
recorded here per PLAN.md's "every one of these gets a row in
LIMITATIONS.md or a test" rule.

This file is owned by Murad per PLAN.md §5's split (Ahad owns upstream/
`INSTALL.md`, Murad owns downstream/`DECISIONS.md`/`LIMITATIONS.md`). The
break-test table below was drafted by Ahad out of Phase 6 necessity and is
verified accurate against the code as of this review — kept as-is. The
"known, accepted limitations" section past it is rewritten below as my own
review, not just a sign-off on the draft: it corrects one row, adds three
real gaps found while re-reading `src/`, `build/drivers/`, and
`workflow.json` directly rather than trusting the prior summary.

## Phase 6 break-test results

| Break | Expected | Result | Covered by |
|---|---|---|---|
| Kill Postgres mid-run | Error branch fires, Slack alert, no partial writes | **Confirmed**, with a caveat: n8n's own app DB and the recon schema share one Postgres container/database. Killing the container kills n8n's own scheduler/API too, not just the recon write path — there's no way to fail only the workflow's queries while n8n stays up in this setup. Verified the actual write-path failure mode instead (bad table name simulating "DB unreachable for this insert"): `Insert Run`'s error correctly routes to `Failure Alert`, `Mark Run Failed`/`Upsert Exception`/`Insert Match` correctly never run, zero rows written anywhere. | Live verification only |
| Revoke the Stripe key | Auth error caught, named in the alert, run marked failed | **Confirmed, after a fix.** `Get many charges`'s own error branch worked, but the execution then crashed at `Normalize` (`Node 'Filter' hasn't been executed'`) because it reads `$('Filter')` by name and `Filter` never ran. Gave `Normalize` the same `onError` → `Failure Alert` branch every other pipeline node has. Now the run stops cleanly. Note: "run marked failed" per the table's literal wording doesn't apply here — no `runs` row exists yet this early in the graph, so there's nothing to mark failed (same reasoning as the Postgres-kill row; documented as intentional design in session 9/13). Side effect: `Failure Alert` fires twice for one root cause (once from the fetch node, once from `Normalize`) — cosmetic alert duplication, not fixed. | Live verification only |
| Seed 250 charges | Pagination fetches all 250, not 100 | **Confirmed.** `Get many charges` fetched 636 items total (all history in the widened test window), `Filter` narrowed to exactly 250 — the tagged batch, no loss, not capped at Stripe's 100-per-page default. Also surfaced an unrelated bug: `Insert Run` was still using the old comma-joined multi-`{{ }}` query pattern the 2026-07-20 decision log had already banned (the other two Postgres nodes were migrated, this one wasn't) — broke under paired-item resolution at this data volume. Fixed to the single-array-expression form. | Live verification only |
| Run twice in a row | Exception count identical, `last_seen` updated | **Confirmed.** Also caught and fixed a real regression while testing this: `Upsert Exception`/`Insert Match` had no `queryBatching` baked into `workflow.template.json`, so a fresh canvas re-import silently reverted to n8n's default (`single`, collapsing all items to one query) instead of `independently` — undoing the session-11 fix on every re-import. Now explicit in the template. | Live verification only |
| Empty day (zero charges) | Posts "nothing to reconcile," does not crash | Confirmed: `formatSlackMessage` on zero payments/zero deals posts a clean headline (`0 payments · 0 clean · 0 exceptions · $0.00 unreconciled`), no crash. | `test/format.test.js` |
| Deal with no associated contact | Skipped with a warning, doesn't kill the run | Confirmed: a `closedwon` deal with no email (contact join failed upstream) is silently skipped, no exception raised, run continues. | `test/classify.test.js` |
| Deal amount is null | Skipped with a warning | Confirmed: amount scoring is skipped entirely (not treated as 0), pair still lands in `review` at reduced confidence — visible to a human as a `REVIEW` exception, not silently dropped. | `test/matcher.test.js` |
| Charge with no email | `PAYMENT_NO_DEAL`, flagged "no email — cannot match" | Confirmed, after a fix: `classify.js` already set an `unmatchable` flag on these, but `format.js` never read it, so the reason never reached Slack. Added the missing check. | `test/classify.test.js`, `test/format.test.js` |
| Clock skew: charge timestamped in the future | Handled, not silently dropped | Confirmed: a charge timestamped years in the future is still scored and paired normally. | `test/matcher.test.js` |
| Slack webhook 404 | Run still completes, data still written, failure logged | Confirmed: Postgres and Sheets both write successfully; Slack's own failure routes to `Failure Alert`, not `Mark Run Failed` (the run itself succeeded — only the notification failed), per the session 13 design decision. | Live verification only |

## Known, accepted limitations (not bugs, not fixed)

- **Shared Postgres instance.** n8n's own application database and the
  recon schema (`runs`/`exceptions`/`matches`) live in the same Postgres
  container. A full Postgres outage takes n8n's scheduler down with it —
  there's no way to isolate "the recon DB is down" from "n8n itself is
  down" without a second Postgres instance, which is out of scope for a
  single-client deployment.
- **Duplicate Slack alerts on cascading upstream failures.** If a fetch
  node fails AND a downstream node's own error handling also fires (e.g.
  `Get many charges` fails, then `Normalize` also errors trying to read
  it), `Failure Alert` posts once per failing node, not once per
  incident. Cosmetic noise, not a correctness issue.
- **`subscriptionId` is always `null`.** The native n8n Stripe node's
  `charge: getAll` operation has no `expand` parameter, so a real
  subscription ID can't be populated without swapping to a hand-rolled
  HTTP Request node with manual pagination. Scoped, not built — see
  `progress.md`'s Next-session notes. Practical effect: `excludeSubscriptions`
  (`src/classify.js`) is currently a no-op in production — every renewal
  charge will false-positive as `PAYMENT_NO_DEAL` until this lands.
- **Slack webhook still needs rotating** — was hardcoded locally for a
  while earlier in the project (never pushed to a public remote), good
  hygiene to rotate regardless.
- Non-goals from PLAN.md §1 (no dashboard, no LLM in the matcher, no
  multi-currency, no GHL adapter) are deliberate scope cuts, not gaps.

### Found on this review, not previously listed

- **Currency mismatch produces no distinguishing signal.** `matcher.js`'s
  `scorePair` returns `null` outright when `payment.currency !==
  deal.currency` (`src/matcher.js:41`) — correct per PLAN.md §7.2 ("do not
  silently compare"), but the pair simply never becomes a candidate. The
  payment and deal each fall through to `unmatchedPayments`/
  `unmatchedDeals` and get classified as ordinary `PAYMENT_NO_DEAL` /
  `DEAL_NO_PAYMENT` — indistinguishable from a genuine untracked payment
  or an open deal. A human looking at the Slack alert has no way to tell
  "this is a currency mismatch, not a missing record" without pulling both
  records and comparing manually. Covered by a matcher test (confirms no
  match happens), not by a distinct exception type or reason string.
  Multi-currency is already a v1 non-goal, so not fixing this — flagging
  it so nobody mistakes the current `PAYMENT_NO_DEAL` count for "real"
  during a demo against non-USD test data.

- ~~**`Normalize`'s deal↔contact join was positional, not keyed.**~~
  **FIXED and confirmed live this session.** `build/drivers/normalize.driver.js`
  used to pair `rawDeals[i]` with `rawContacts[i]` by array index. `Get a
  contact`'s `onError` is `continueErrorOutput`
  (`workflow/workflow.json`) — a single deal's contact lookup failing
  mid-batch routes that item to the error branch and drops it from the
  success array, shifting every contact after it one position out of
  alignment. Reproduced live against the real stack: with 28 deals and one
  contact lookup forced to fail, the deal whose lookup failed showed up in
  `Normalize`'s output carrying the *next* deal's real customer email
  (`john.smith@ironhidefitness.com`, confirmed via matching HubSpot contact
  `vid` against the deal's `associations.associatedVids[0]`) — silently
  wrong data, no error anywhere. Fixed by keying the join off each contact's
  `vid` against each deal's `associations.associatedVids[0]` in a `Map`,
  instead of trusting array position. Verified fresh live import runs clean
  (no disabled nodes, original expressions, fix present). Not yet unit
  tested — `normalize.driver.js` is n8n glue, outside `src/*.js`'s Vitest
  coverage; worth a dedicated test fixture if this file ever gets pulled
  into `src/`.

- **No backfill path for a missed run.** PLAN.md §7.5 calls this out
  explicitly: if the nightly cron doesn't fire (host down, n8n down,
  Postgres down), today's window is still "yesterday" — the day that was
  actually missed never gets checked, and its exceptions are silently
  lost forever, not caught on the next successful run. PLAN.md's own
  suggested fix (`--backfill <date>`) was never built. Manual recovery
  today means hand-editing `Edit Fields`'s window and re-running once,
  which works but isn't documented anywhere and isn't a real operational
  path for a non-technical client.

- **Unicode / IDN email domains are out of scope**, carried over from
  PLAN.md §7.1 but never previously written down here. `normalizeEmail`
  does a plain lowercase/trim/plus-strip — no IDNA normalization. An email
  with a non-ASCII domain that Stripe and HubSpot each represent slightly
  differently (Unicode vs. punycode) would fail to match with no specific
  error, just an ordinary unmatched pair. Same category of problem as the
  currency-mismatch row above: silent, not loud.

- **Partial refunds are invisible in the report.** Documented at the
  contract level (`docs/CONTRACT.md`'s `refunded` semantics) but worth
  restating here since it's a real gap a client will notice: a $500
  refund on an otherwise-matching $2,000 charge leaves `refunded: false`
  and reports as a clean match, full stop — no `partial_refund` flag
  exists yet. Money that came back is real revenue drift and currently
  gets zero visibility in Slack or the Sheet.
