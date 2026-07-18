const DEFAULT_CONFIG = {
  duplicateWindowMs: 60 * 60 * 1000,
};

function isDuplicateOf(a, b, windowMs) {
  if (a === b) return false;
  if (!a.email || a.email !== b.email) return false;
  const aCents = Math.round(a.amount * 100);
  const bCents = Math.round(b.amount * 100);
  if (aCents !== bCents) return false;
  const diffMs = Math.abs(new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return diffMs <= windowMs;
}

export function classify(matchResult, config) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const exceptions = [];

  for (const pair of [...matchResult.matched, ...matchResult.review]) {
    const { payment, deal, confidence, reasons } = pair;
    if (payment.refunded && deal.stage === 'closedwon') {
      exceptions.push({ type: 'ORPHAN_REFUND', payment, deal, confidence });
    } else if (reasons.includes('amount_within_10pct')) {
      exceptions.push({ type: 'AMOUNT_MISMATCH', payment, deal, confidence });
    } else if (matchResult.review.includes(pair)) {
      exceptions.push({ type: 'REVIEW', payment, deal, confidence });
    }
  }

  for (const deal of matchResult.unmatchedDeals) {
    if (deal.stage === 'closedwon') {
      exceptions.push({ type: 'DEAL_NO_PAYMENT', deal });
    }
  }

  const allPayments = [
    ...matchResult.matched.map((m) => m.payment),
    ...matchResult.review.map((r) => r.payment),
    ...matchResult.unmatchedPayments,
  ];

  for (const payment of matchResult.unmatchedPayments) {
    const duplicateOf = allPayments.find((other) => isDuplicateOf(payment, other, cfg.duplicateWindowMs));
    if (duplicateOf) {
      exceptions.push({ type: 'DUPLICATE_CHARGE', payment, duplicateOf });
    } else {
      exceptions.push({ type: 'PAYMENT_NO_DEAL', payment, unmatchable: !payment.email });
    }
  }

  return exceptions;
}
