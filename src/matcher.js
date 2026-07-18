// THE BRAIN. Pure function. No I/O, no API calls, no console.log, no date-of-today.
// Sees only the contract shape (docs/CONTRACT.md) — never a vendor name.

export const DEFAULT_CONFIG = {
  scoreEmailExact: 50,
  scoreNameFuzzy: 20,
  nameFuzzyThreshold: 0.85,
  scoreAmountExact: 40,
  scoreAmountFeeTolerance: 25,
  feeTolerance: 0.035, // 3.5%
  scoreAmountTenPercent: 10,
  amountTolerancePercent: 0.10,
  scoreTimestamp24h: 10,
  scoreTimestamp48h: 5,
  autoMatchThreshold: 85,
  reviewThreshold: 60,
};

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return 0;
  const maxLen = Math.max(x.length, y.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(x, y) / maxLen;
}

function toCents(amount) {
  return Math.round(amount * 100);
}

function scoreAmount(payment, deal, config) {
  if (payment.amount == null || deal.amount == null) {
    return { points: 0, reason: null };
  }
  if (toCents(payment.amount) === toCents(deal.amount)) {
    return { points: config.scoreAmountExact, reason: "amount exact" };
  }
  const base = deal.amount || payment.amount || 1;
  const pct = Math.abs(payment.amount - deal.amount) / base;
  if (pct <= config.feeTolerance) {
    return { points: config.scoreAmountFeeTolerance, reason: "amount within fee tolerance" };
  }
  if (pct <= config.amountTolerancePercent) {
    return { points: config.scoreAmountTenPercent, reason: "amount within 10%" };
  }
  return { points: 0, reason: null };
}

function scoreTimestamp(payment, deal, config) {
  if (!payment.timestamp || !deal.timestamp) return { points: 0, reason: null };
  const hours = Math.abs(new Date(payment.timestamp) - new Date(deal.timestamp)) / 3_600_000;
  if (hours <= 24) return { points: config.scoreTimestamp24h, reason: "timestamp within 24h" };
  if (hours <= 48) return { points: config.scoreTimestamp48h, reason: "timestamp within 48h" };
  return { points: 0, reason: null };
}

function scorePair(payment, deal, config) {
  let points = 0;
  const reasons = [];

  const emailMatch = payment.email && deal.email && payment.email === deal.email;
  if (emailMatch) {
    points += config.scoreEmailExact;
    reasons.push("email exact");
  } else if (!payment.email && !deal.email) {
    const similarity = nameSimilarity(payment.name, deal.name);
    if (similarity > config.nameFuzzyThreshold) {
      points += config.scoreNameFuzzy;
      reasons.push("name fuzzy");
    }
  }

  const amountScore = scoreAmount(payment, deal, config);
  points += amountScore.points;
  if (amountScore.reason) reasons.push(amountScore.reason);

  const timeScore = scoreTimestamp(payment, deal, config);
  points += timeScore.points;
  if (timeScore.reason) reasons.push(timeScore.reason);

  return { points, reasons };
}

function isCandidatePair(payment, deal) {
  if (payment.email && deal.email) return payment.email === deal.email;
  return !payment.email && !deal.email;
}

export function match(payments, deals, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const candidates = [];
  for (const payment of payments) {
    for (const deal of deals) {
      if (!isCandidatePair(payment, deal)) continue;
      const { points, reasons } = scorePair(payment, deal, cfg);
      if (points < cfg.reviewThreshold) continue;
      candidates.push({ payment, deal, confidence: points, reasons });
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  const claimedPayments = new Set();
  const claimedDeals = new Set();
  const matched = [];
  const review = [];

  for (const candidate of candidates) {
    if (claimedPayments.has(candidate.payment) || claimedDeals.has(candidate.deal)) continue;
    claimedPayments.add(candidate.payment);
    claimedDeals.add(candidate.deal);
    if (candidate.confidence >= cfg.autoMatchThreshold) {
      matched.push(candidate);
    } else {
      review.push(candidate);
    }
  }

  const unmatchedPayments = payments.filter((p) => !claimedPayments.has(p));
  const unmatchedDeals = deals.filter((d) => !claimedDeals.has(d));

  return { matched, review, unmatchedPayments, unmatchedDeals };
}
