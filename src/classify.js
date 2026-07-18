// Match results -> exception types. Pure function. No I/O.
// The matcher's job is pairing; this is naming what's left (and what's wrong).

export const DEFAULT_CLASSIFY_CONFIG = {
  feeTolerance: 0.035, // 3.5%, must match matcher config
  duplicateWindowMinutes: 60,
};

function toCents(amount) {
  return Math.round(amount * 100);
}

function minutesBetween(a, b) {
  return Math.abs(new Date(a) - new Date(b)) / 60_000;
}

function findDuplicates(unmatchedPayments, config) {
  const used = new Set();
  const exceptions = [];

  for (let i = 0; i < unmatchedPayments.length; i++) {
    if (used.has(i)) continue;
    for (let j = i + 1; j < unmatchedPayments.length; j++) {
      if (used.has(j)) continue;
      const a = unmatchedPayments[i];
      const b = unmatchedPayments[j];
      if (!a.email || a.email !== b.email) continue;
      if (a.amount == null || toCents(a.amount) !== toCents(b.amount)) continue;
      if (minutesBetween(a.timestamp, b.timestamp) > config.duplicateWindowMinutes) continue;

      used.add(i);
      used.add(j);
      exceptions.push({
        type: "DUPLICATE_CHARGE",
        charge_id: a.id,
        deal_id: null,
        email: a.email,
        amount: a.amount,
        confidence: null,
        detail: { reasons: ["duplicate of"], linkedChargeId: b.id },
      });
      exceptions.push({
        type: "DUPLICATE_CHARGE",
        charge_id: b.id,
        deal_id: null,
        email: b.email,
        amount: b.amount,
        confidence: null,
        detail: { reasons: ["duplicate of"], linkedChargeId: a.id },
      });
      break;
    }
  }

  return { exceptions, used };
}

export function classify(matcherResult, config = {}) {
  const cfg = { ...DEFAULT_CLASSIFY_CONFIG, ...config };
  const { matched, review, unmatchedPayments, unmatchedDeals } = matcherResult;
  const exceptions = [];

  const { exceptions: duplicateExceptions, used } = findDuplicates(unmatchedPayments, cfg);
  exceptions.push(...duplicateExceptions);

  unmatchedPayments.forEach((payment, i) => {
    if (used.has(i)) return;
    exceptions.push({
      type: "PAYMENT_NO_DEAL",
      charge_id: payment.id,
      deal_id: null,
      email: payment.email,
      amount: payment.amount,
      confidence: null,
      detail: payment.email ? {} : { reasons: ["unmatchable — no email"] },
    });
  });

  for (const deal of unmatchedDeals) {
    if (deal.stage !== "closedwon") continue; // open deal, no payment yet — not an exception
    exceptions.push({
      type: "DEAL_NO_PAYMENT",
      charge_id: null,
      deal_id: deal.id,
      email: deal.email,
      amount: deal.amount,
      confidence: null,
      detail: {},
    });
  }

  for (const { payment, deal, confidence, reasons } of matched) {
    const fullyRefunded =
      payment.refunded && payment.refundedAmount != null && toCents(payment.refundedAmount) >= toCents(payment.amount);
    const partialRefund = payment.refunded && !fullyRefunded && payment.refundedAmount > 0;

    if (fullyRefunded && deal.stage === "closedwon") {
      exceptions.push({
        type: "ORPHAN_REFUND",
        charge_id: payment.id,
        deal_id: deal.id,
        email: payment.email,
        amount: payment.amount,
        confidence,
        detail: { reasons },
      });
      continue;
    }

    if (payment.amount != null && deal.amount != null) {
      const pct = Math.abs(payment.amount - deal.amount) / (deal.amount || payment.amount || 1);
      if (pct > cfg.feeTolerance) {
        exceptions.push({
          type: "AMOUNT_MISMATCH",
          charge_id: payment.id,
          deal_id: deal.id,
          email: payment.email,
          amount: payment.amount,
          confidence,
          detail: partialRefund ? { reasons, note: "partial_refund" } : { reasons },
        });
      }
    }
  }

  return { exceptions, review };
}
