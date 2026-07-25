# Decisions

Every real choice made building this, and why. Not a changelog — a changelog
is `git log`. This is the reasoning a changelog throws away.

---

## Architecture

### No LLM in the matcher
Deterministic scoring, not an LLM call. Payment-to-deal matching is a
solvable scoring problem: email, amount, and time are comparable, rankable
signals. An LLM here would be slower, non-deterministic (same input can
produce different output run to run), untestable in the normal sense (you
can't assert exact output against a fixture when the model can phrase things
differently), and impossible to explain to a client who asks "why did it
flag this one." A deterministic scorer with a documented threshold table
answers that question in one sentence. Reaching for an LLM on a problem that
doesn't need one is worse for credibility than not using one at all — it
signals you don't know when *not* to reach for the hammer you're used to.

### Nightly batch, not real-time
Reconciliation is a look-back by nature — you're checking whether what
already happened lines up, not reacting to something as it happens. Real-time
would mean webhooks from both Stripe and the CRM, a queue, dedup logic for
out-of-order delivery, and infrastructure to keep that queue alive — all cost,
no value, because nobody needs to know a payment/deal mismatch within seconds
of it occurring. A human checks Slack in the morning either way. Nightly cron
(2am) is the correct design for what this actually is, not a compromise.

### Greedy pair assignment, not first-match-wins
The naive approach — for each payment, take the first deal with a matching
email — breaks the instant one customer has two deals or two charges. Mike is
the proof case: two $500 charges, one deal, 10 minutes apart. First-match-wins
lets the first charge claim the deal and calls the second `PAYMENT_NO_DEAL` —
wrong. It's a duplicate charge, not an unrecorded payment; different exception
type, different fix, different Slack message. The correct algorithm scores
every payment against every candidate deal (candidates = same normalized
email), sorts all pairs by score descending, then greedily claims — highest-
confidence pairs win first, so a genuine strong match can't be blocked by a
weaker candidate that happened to be listed first. Whatever's left over after
assignment goes to the classifier, which is where duplicate detection
actually happens — the matcher's only job is pairing, never naming what's
left.

### The matcher is a pure function
`src/matcher.js` takes `(payments, deals, config)` and returns a result — no
I/O, no API calls, no `console.log`, no reading the current date. Every
threshold lives in `config`, nothing hardcoded. This is what makes it
testable without Docker, without n8n, without live credentials: the entire
Phase 3 test suite ran against fixtures alone, in parallel with Ahad's
infrastructure work, and never had to wait on it.

### The CRM-agnostic seam
The CRM is touched in exactly two places: the fetch node and the normalize
function. Everything downstream — `matcher.js`, `classify.js`, `format.js` —
sees only the contract shape (`docs/CONTRACT.md`), never a vendor name. The
actual test: `grep -ri "hubspot" src/matcher.js src/classify.js src/format.js`
must return nothing. This isn't multi-CRM support (no adapter framework, no
plugin system — that's scope creep this project explicitly avoids) — it's one
CRM built properly behind one seam, so swapping to GoHighLevel or Pipedrive
later means replacing one fetch node and one normalize function, not a
rewrite.

### `build/inject.js` — the code that's tested is the code that runs
`src/*.js` are real files Vitest tests directly. But n8n needs that code
living inside a Code node, which is a JSON string inside `workflow.json`.
Hand-pasting means eventually fixing a bug, forgetting to re-paste, and
demoing the old broken version while the repo shows the fix. `build/inject.js`
reads the tested source and writes it into the generated JSON — the file that
ran through Vitest is guaranteed byte-identical to the file that executes in
n8n. `workflow.json` itself is never hand-edited as a result; `workflow.template.json`
plus `src/*.js` are the only source of truth, `npm run build` is the only path
between them.

---

## Matching rules

### Dots are not stripped from emails
Email normalization is trim → lowercase → strip the plus-tag (`+billing`) →
stop. Dots are deliberately left alone. Gmail treats `j.smith@gmail.com` and
`jsmith@gmail.com` as the same inbox, but that's a Gmail-specific quirk, not
a universal email rule — most other providers treat them as genuinely
different addresses belonging to different people. Stripping dots globally
to catch the Gmail case would risk silently merging two different customers
at every other provider. The cost of getting this wrong (merging two real
customers' financial records) outweighs the benefit (catching a rare Gmail
dot-typo), so the safer, more conservative rule wins. Documented in
`docs/LIMITATIONS.md` as a known non-match case.

### Fee tolerance is a percentage band, not an exact-match requirement
A charge for $1,940.50 against a $2,000 deal (2.98% short) is a normal
processor-fee deduction, not a discrepancy — it still auto-matches, just at
reduced confidence (85) with a `fee_adjusted` reason rather than a plain
exact match. The threshold is `feeTolerance` in config (default 3.5%), not
hardcoded, since a client on a different payment processor has different real
fees. Anything past 10% stops being explainable as a fee and becomes
`AMOUNT_MISMATCH` — a genuine unlogged discount or partial payment worth a
human's attention.

### Same-calendar-day matching is wrong; use a rolling window instead
A charge at 23:58 on Jan 14 and a deal closed at 00:04 on Jan 15 are six
minutes apart and should match — but a calendar-day boundary check would
treat them as two different days and miss the pair entirely. Time scoring
compares actual elapsed time (within 24h / within 48h bands), never calendar
dates. Deal-close lag of up to a few days after payment is also normal (CRM
data entry isn't instant) and contributes nothing to the exception logic —
only the email+amount score decides a match; time is a soft signal, not a
gate.

### Open-stage deals with no payment are not exceptions
Only `stage=closedwon` deals with no matching payment fire `DEAL_NO_PAYMENT`.
A deal sitting in "Negotiation" hasn't closed yet, so of course there's no
payment — flagging it would flood the report with noise on every deal
currently in the pipeline and make the actual signal unreadable.

### Subscription renewals are excluded from `PAYMENT_NO_DEAL`, config-gated
A subscription renewal charge legitimately has no new CRM deal — the deal was
created once, at signup, not every billing cycle. Without an exclusion, every
renewal would false-positive as `PAYMENT_NO_DEAL` forever, which PLAN.md
correctly calls out as the single most credibility-damaging bug this project
could ship to a real client. `subscriptionId` was added to the payment
contract (`null` for a one-off charge, the Stripe subscription ID string for
a renewal) specifically so `classify.js` can skip the check — gated behind
`excludeSubscriptions` (default on) so it's still a config choice, not a
silent hardcoded assumption. As of Phase 6 the field is still always `null`
in production: the native n8n Stripe node's `charge:getAll` operation has no
`expand` parameter, so populating the real value needs a hand-rolled HTTP
Request node with manual pagination — scoped but deliberately not built yet
(Ahad's fetch-node ownership), logged honestly in `docs/LIMITATIONS.md`
rather than left silently broken.

### `refunded` means fully refunded — full stop
This mirrors Stripe's own `charge.refunded` semantics exactly: `true` only
when the entire amount came back. A partial refund leaves `refunded: false`
with `refundedAmount` set to whatever was returned. `ORPHAN_REFUND` fires on
`refunded === true`, never on `refundedAmount > 0` — a partial refund on an
otherwise-matching charge is a clean match in v1, not an orphan (no
`partial_refund` annotation exists yet; parked, not built). This had to be
written down explicitly after two independently-written `classify.js` drafts
disagreed about it mid-project — one assumed partial refunds could still set
`refunded: true`. Documenting Stripe's real behavior settled it.

### The `resolved` Sheet checkbox is report-only
Honoring a human checking "resolved" in the Sheet would mean reading that
checkbox back out of Sheets into Postgres — a sync loop, extra infrastructure,
for a flag on a tool PLAN.md explicitly scopes as non-load-bearing (Postgres
is the real source of truth; Sheets is a bookkeeper-friendly view). Checking
the box doesn't change the underlying Stripe/HubSpot data, so the exception
correctly re-fires every run regardless — that's not a bug, it's the flag
being honest about what it actually represents (a human todo marker, not a
system state).

---

## Infrastructure

### Postgres over SQLite for both n8n's own DB and the exception log
n8n needs a backend DB regardless, and the exception log needs one too —
running two different database engines in one Docker Compose stack for no
reason is unnecessary complexity. One Postgres instance backs both. The
`exceptions` table's `UNIQUE (exception_type, charge_id, deal_id)` constraint
is what makes re-runs idempotent at the database level, not just in
application logic — a second execution upserts (`ON CONFLICT ... DO UPDATE
SET run_id = EXCLUDED.run_id, last_seen = now()`) instead of duplicating.
`NULL != NULL` in Postgres meant the naive version of this broke for
`DEAL_NO_PAYMENT`/`PAYMENT_NO_DEAL` rows (one of `charge_id`/`deal_id` is
always null there) — fixed by using `''` instead of `null` at the query-
parameter level rather than restructuring the schema this late.

Accepted tradeoff, not fixed: sharing one Postgres instance between n8n's own
app database and the recon schema means a full Postgres outage takes n8n's
scheduler down with it too — there's no way to isolate "the recon DB is
unreachable" from "n8n itself is down" without a second instance, which is
out of scope for a single-client deployment. Documented in
`docs/LIMITATIONS.md`, verified live rather than assumed.

### Postgres `queryReplacement` must be a single array expression, never comma-joined
n8n's older `{{ }}, {{ }}, ...` pattern for a Postgres node's query parameters
stringifies and splits on literal commas — breaks the instant any one value
(e.g. `JSON.stringify(...)` output) contains a comma of its own. Every
Postgres node in this workflow uses the single `={{ [ ... ] }}` array-
expression form instead. This bit two nodes independently before being
recognized as a pattern (`Upsert Exception`, `Insert Match`) and a third node
even after the pattern was documented (`Insert Run`, missed in the same pass,
found later under a 250-charge pagination stress test) — worth stating
explicitly here since it's exactly the kind of thing that looks fine on a
small manual test and only breaks under real volume.

### `queryBatching: independently` must be explicit in the template, not left as a live-canvas setting
n8n does not preserve a node's `queryBatching` option on reimport unless it's
explicitly present in `parameters.options` — it silently falls back to the
default (`single`, which collapses all input items into one query execution
and returns only one output item). This is wrong for `Upsert Exception` and
`Insert Match`, which need one query per input row. The fix found in session
11 kept getting silently undone by every subsequent clean reimport until it
was baked directly into `workflow.template.json` itself, rather than treated
as something you set once in the UI and forget.

### Error branches on every fetch, write, and notify node
Every node that talks to an external service (Stripe, CRM, Postgres, Sheets,
Slack) has an explicit `onError` branch routing to a failure-alert path,
rather than the default n8n behavior of stopping the whole execution
silently. This was treated as core functionality, not decoration — a nightly
workflow that dies at 2am with zero signal is worse than no workflow at all,
because it creates false confidence that reconciliation happened when it
didn't. Each break scenario in PLAN.md's Phase 6 table was reproduced live
against the real stack (temporary/throwaway credentials, never the shared
real ones) before being called done — see `docs/LIMITATIONS.md` for the full
results table.

### `Mark Run Failed` finds the latest run row itself, not a passed-in reference
Early error branches referenced `$('Insert Run')` directly to know which
`runs` row to mark failed, which n8n's own validator flagged as unreachable
from certain error paths in the graph. Root-cause fix: since exactly one
`runs` row exists per execution, the query finds it itself
(`WHERE id = (SELECT id FROM runs ORDER BY id DESC LIMIT 1)`) instead of
depending on a specific upstream node reference — works from any error
branch regardless of where it sits in the graph, and can't break again the
same way if the graph shape changes later.

### Never reimport onto a canvas that already has a workflow with the same node names
n8n creates renamed duplicates (`Filter2`, `Normalize1`, etc.) on name
conflict instead of replacing in place, which silently diverges the live
canvas from the committed `workflow.json` — cost real debugging time
chasing stale duplicate node output before the pattern was recognized.
Standard practice adopted going forward: delete the canvas workflow
completely before every reimport.

---

## Data / seeding

### Stripe test charges are refunded, never deleted, on teardown
Stripe's API has no charge-delete endpoint — refunding is the closest real
cleanup available. Test-mode charges persisting in the dashboard costs
nothing, but it does mean every past seed batch stays in Stripe permanently
with its original `created` timestamp and will re-enter any date window wide
enough to include it. This is a real, accepted consequence, not a bug: raw
`SELECT count(*) FROM exceptions` became permanently unreliable as a
same-day manual verification method in this shared test sandbox over the
course of the project — the reliable method is cross-checking specific known
charge IDs (via `metadata.seed`) against `expected.json`, not trusting the
raw count once a sandbox has enough history in it.

### `matches` grows append-only per run; it is not deduplicated like `exceptions`
`db/schema.sql`'s own comment states the `UNIQUE` constraint on `exceptions`
is the system's idempotency key — `matches` is a deliberate per-run audit
log, not a dedup target, so it's expected and correct for it to have more
rows after every re-run of the same data, not fewer.

---

## Process

### The contract is a conversation, not a commit
`docs/CONTRACT.md` (the payment/deal shape both halves agree on) only
changes with both people signing off the same day, never unilaterally. This
held for both real shape changes made mid-project — adding `subscriptionId`
and clarifying `refunded`'s full-refund-only semantics — both logged with an
addendum and a checkbox for the other person, not silently merged in.

### Say so, don't silently deviate from PLAN.md
PLAN.md is locked and treated as the source of truth for scope, but when
PLAN.md self-contradicted (its exceptions table called Jenna a `REVIEW` case
while its own scoring table and worked example both put her score at exactly
85, which is an auto-match) the fix was to flag the contradiction explicitly,
make a call, and log it — not to quietly pick one interpretation and move on.
Same standard applied when `docs/LIMITATIONS.md` had to be drafted by the
person who doesn't own it (Ahad drafted it under Phase 6's own closing
requirement, then explicitly flagged it for the actual owner, Murad, to
review and rewrite rather than let the draft stand as final by default).
