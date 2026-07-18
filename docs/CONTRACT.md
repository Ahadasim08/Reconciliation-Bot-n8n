# The Contract

**This is the seam between the two halves. It is frozen.** Ahad's half (upstream:
Stripe + CRM → normalized shape) produces exactly these shapes. Murad's half
(downstream: matcher → classify → format) consumes exactly these shapes. Neither
side ever sees the other's internals.

Changing anything here is **a conversation, not a commit.** Both people update, both
test, same day. (Source of truth: PLAN.md section 2.)

---

## Input shapes (Ahad produces, Murad consumes)

### A normalized payment (from Stripe)

```js
{
  source: "stripe",
  id: "ch_3Ox1a2B...",                    // native ID, for the link back
  email: "sarah.chen@acme.com",           // ALREADY lowercased, plus-tag stripped
  name: "Sarah Chen",                     // may be null
  amount: 2000.00,                        // DOLLARS as a number, never cents, never string
  currency: "usd",
  timestamp: "2026-01-14T10:14:32.000Z",  // ALWAYS UTC ISO8601
  refunded: false,                        // true ONLY when the FULL amount was refunded
  refundedAmount: 0.00,                   // can be > 0 while refunded is still false (partial)
  subscriptionId: null,                   // Stripe subscription ID string, or null for a one-off charge
  url: "https://dashboard.stripe.com/test/payments/ch_3Ox1a2B..."
}
```

### A normalized deal (from the CRM — ANY CRM)

```js
{
  source: "hubspot",                      // or "gohighlevel", "pipedrive", etc.
  id: "8801",
  email: "sarah.chen@acme.com",           // ALREADY normalized, same rules
  name: "Sarah Chen",
  amount: 2000.00,
  currency: "usd",
  timestamp: "2026-01-14T00:00:00.000Z",  // close date, UTC
  stage: "closedwon",
  url: "https://app.hubspot.com/contacts/12345/deal/8801"
}
```

The canonical example of both shapes lives in `test/fixtures/clean.json`
(7 payments / 6 deals).

---

## Output shape (Murad's matcher produces)

`src/matcher.js` is a pure function: `match(payments, deals, config)`.

```js
match(payments, deals, config) -> {
  matched:           [{ payment, deal, confidence, reasons }],
  review:            [{ payment, deal, confidence, reasons }],
  unmatchedPayments: [payment],
  unmatchedDeals:    [deal]
}
```

- `confidence` — integer score (see PLAN.md section 6 scoring).
- `reasons` — array explaining the score (e.g. `["email exact", "amount exact"]`).
- The matcher's job is **pairing only.** Naming what's left over is `classify.js`'s
  job, not the matcher's.

---

## Exception types (classify.js produces)

| Type | Meaning |
|---|---|
| `PAYMENT_NO_DEAL` | Money arrived, no CRM record |
| `DEAL_NO_PAYMENT` | Deal marked won, no money |
| `AMOUNT_MISMATCH` | Deal and charge amounts differ beyond tolerance |
| `DUPLICATE_CHARGE` | Same customer, same amount, short window |
| `ORPHAN_REFUND` | Refunded, deal still shows won |

Plus a sixth non-exception state: `REVIEW` — matched, confidence 60–84, a human
confirms. These five strings are the only allowed values in the `exceptions`
table's `exception_type` column (`db/schema.sql`).

---

## Output shape (Murad's format.js produces)

`src/format.js` takes matcher output + classify's exceptions, no I/O of its own.

```js
formatSlackMessage(matchResult, exceptions, config) -> {
  blocks: [ /* Slack block-kit sections: headline, then up to config.maxExceptionsInMessage
              exception lines sorted by severity, then "...and N more, see sheet." if capped */ ]
}

formatSheetRows(exceptions) -> [{
  date, type, amount, customer, email, confidence,  // confidence is null for unmatched-only exceptions
  paymentLink,                                       // exception.payment.url, or null (DEAL_NO_PAYMENT has no payment)
  dealLink,                                          // exception.deal.url, or null (PAYMENT_NO_DEAL/DUPLICATE_CHARGE have no deal)
  resolved: false,                                   // n8n/Postgres owns flipping this true, format.js never does
}]

summarize(matchResult, exceptions) -> { totalPayments, cleanCount, exceptionCount, unreconciledAmount }
```

- Severity order for the Slack message: `DUPLICATE_CHARGE`, `PAYMENT_NO_DEAL` first
  (money is wrong right now), `REVIEW` last. Zero exceptions still produces a headline
  block — a silent bot is indistinguishable from a broken bot.
- Sheet-row and Postgres-row idempotency (skip-if-exists, upsert keys) is Phase 5
  wiring, not `format.js`'s job — it always emits one row per exception it's given.

---

## Contract rules — no exceptions

- **Money is always a number in dollars.** Stripe gives cents, HubSpot gives a
  string. Both convert before crossing this line. `2000.00`, never `200000`,
  never `"2000"`.
- **Emails are always lowercased and plus-tag-stripped before crossing this line.**
  The matcher never sees `Sarah.Chen@ACME.com`. Dots are **not** stripped
  (deliberate — see DECISIONS.md).
- **Timestamps are always UTC ISO8601.** No local time, no epoch, no date-only.
- **`url` is always populated.** It's what makes the Sheet clickable.
- **Missing data is `null`**, never `""`, never `0`, never `undefined`.
- **The matcher must not know which CRM the deal came from.** If `matcher.js`,
  `classify.js`, or `format.js` contains the string "hubspot" / "stripe" / any
  vendor name, the seam is broken.
- **`refunded` means fully refunded, full stop.** This mirrors Stripe's own
  `charge.refunded` field: it is `true` only when the entire charge amount has
  been refunded. A partial refund leaves `refunded: false` with
  `refundedAmount` set to whatever was returned (e.g. `refunded: false,
  refundedAmount: 500.00` on a $2,000 charge). `classify.js`'s `ORPHAN_REFUND`
  check relies on this: it fires on `refunded === true`, not on
  `refundedAmount > 0`. A partial refund on an otherwise-matching charge is
  **not** an orphan — it's a clean match, full stop, in v1 (no `partial_refund`
  annotation yet; see PLAN.md §7.4, parked as a Phase 4 `format.js` decision).
- **`subscriptionId` is `null` for a one-off charge, the Stripe subscription ID
  string for a renewal.** Exists so `classify.js` can skip `PAYMENT_NO_DEAL`
  for subscription renewals (PLAN.md §7.4 — "the #1 thing that would annoy a
  real client," since a renewal charge normally has no matching new deal).
  `classify.js`'s exclusion is config-gated (`excludeSubscriptions`, defaults
  to on) — it only reads the contract field, never the vendor name.

---

## Sign-off

- [x] Ahad — upstream produces these shapes
- [x] Murad — downstream consumes these shapes

### Addendum — 2026-07-18 (Murad)

Added the `refunded`/`refundedAmount` semantics above. This wasn't previously
spelled out and caused a real disagreement between two independently-written
`classify.js` versions this session (see git history around commit `cf78067`)
— one assumed `refunded: true` could still mean partial, the other assumed
Stripe's real semantics (full-refund-only). Documenting the latter since it's
what Stripe's actual API does and what `db/schema.sql` / the seeder already
assume implicitly.

- [ ] Ahad — confirm this matches what the seeder/Stripe fetch node actually
      produce (a partial refund should leave `refunded: false`)

### Addendum — 2026-07-18 (Ahad + Murad, agreed live)

Added `subscriptionId` to the payment shape (§7.4 subscription-exclusion).
Both agreed: `null` for a one-off charge, the Stripe subscription ID string
for a renewal. `classify.js` gets a config-gated skip (`excludeSubscriptions`)
so renewal charges don't fire false `PAYMENT_NO_DEAL`. Ahad's Stripe fetch
node (Phase 5, not built yet) is responsible for actually populating the
field — until then it's always `null` in fixtures, which is a no-op for the
exclusion logic.

- [x] Ahad — will populate `subscriptionId` from the Stripe fetch node
- [x] Murad — `classify.js` reads it, config-gated, no vendor name in the seam
