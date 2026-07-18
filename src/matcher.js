const DEFAULT_CONFIG = {
  feeTolerance: 0.035,
  amountTenPercentTolerance: 0.10,
  nameFuzzyThreshold: 0.85,
  autoMatchThreshold: 85,
  reviewThreshold: 60,
  timestamp24hMs: 24 * 60 * 60 * 1000,
  timestamp48hMs: 48 * 60 * 60 * 1000,
  scoreEmailExact: 50,
  scoreNameFuzzy: 20,
  scoreAmountExact: 40,
  scoreAmountFeeTolerance: 25,
  scoreAmountTenPercent: 10,
  scoreTimestamp24h: 10,
  scoreTimestamp48h: 5,
};

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[rows - 1][cols - 1];
}

function nameSimilarity(nameA, nameB) {
  const a = nameA.trim().toLowerCase();
  const b = nameB.trim().toLowerCase();
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

function scorePair(payment, deal, config) {
  if (payment.currency !== deal.currency) return null;

  const reasons = [];
  let score = 0;
  let isCandidate = false;

  if (payment.email && deal.email && payment.email === deal.email) {
    isCandidate = true;
    score += config.scoreEmailExact;
    reasons.push('email_exact');
  } else if (!payment.email && !deal.email && payment.name && deal.name) {
    if (nameSimilarity(payment.name, deal.name) > config.nameFuzzyThreshold) {
      isCandidate = true;
      score += config.scoreNameFuzzy;
      reasons.push('name_fuzzy');
    }
  }

  if (!isCandidate) return null;

  if (payment.amount != null && deal.amount != null) {
    const paymentCents = Math.round(payment.amount * 100);
    const dealCents = Math.round(deal.amount * 100);
    const diffRatio = dealCents === 0 ? 0 : Math.abs(paymentCents - dealCents) / dealCents;
    if (paymentCents === dealCents) {
      score += config.scoreAmountExact;
      reasons.push('amount_exact');
    } else if (diffRatio <= config.feeTolerance) {
      score += config.scoreAmountFeeTolerance;
      reasons.push('amount_fee_adjusted');
    } else if (diffRatio <= config.amountTenPercentTolerance) {
      score += config.scoreAmountTenPercent;
      reasons.push('amount_within_10pct');
    } else {
      reasons.push('amount_mismatch');
    }
  }

  if (payment.timestamp && deal.timestamp) {
    const diffMs = Math.abs(new Date(payment.timestamp).getTime() - new Date(deal.timestamp).getTime());
    if (diffMs <= config.timestamp24hMs) {
      score += config.scoreTimestamp24h;
      reasons.push('timestamp_within_24h');
    } else if (diffMs <= config.timestamp48hMs) {
      score += config.scoreTimestamp48h;
      reasons.push('timestamp_within_48h');
    }
  }

  return { score, reasons };
}

export function match(payments, deals, config) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const pairs = [];
  for (const payment of payments) {
    for (const deal of deals) {
      const scored = scorePair(payment, deal, cfg);
      if (scored && scored.score >= cfg.reviewThreshold) {
        pairs.push({ payment, deal, confidence: scored.score, reasons: scored.reasons });
      }
    }
  }
  pairs.sort((a, b) => b.confidence - a.confidence);

  const claimedPayments = new Set();
  const claimedDeals = new Set();
  const matched = [];
  const review = [];

  for (const pair of pairs) {
    if (claimedPayments.has(pair.payment) || claimedDeals.has(pair.deal)) continue;
    claimedPayments.add(pair.payment);
    claimedDeals.add(pair.deal);
    if (pair.confidence >= cfg.autoMatchThreshold) {
      matched.push(pair);
    } else {
      review.push(pair);
    }
  }

  const unmatchedPayments = payments.filter((p) => !claimedPayments.has(p));
  const unmatchedDeals = deals.filter((d) => !claimedDeals.has(d));

  return { matched, review, unmatchedPayments, unmatchedDeals };
}
