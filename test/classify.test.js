import { describe, it, expect } from 'vitest';
import { classify } from '../src/classify.js';
import { match } from '../src/matcher.js';
import fixture from './fixtures/clean.json' with { type: 'json' };

function payment(overrides) {
  return {
    source: 'stripe',
    id: 'ch_x',
    email: 'a@b.com',
    name: 'A B',
    amount: 100,
    currency: 'usd',
    timestamp: '2026-01-14T10:00:00.000Z',
    refunded: false,
    refundedAmount: 0,
    url: 'https://example.com/ch_x',
    ...overrides,
  };
}

function deal(overrides) {
  return {
    source: 'hubspot',
    id: 'd_x',
    email: 'a@b.com',
    name: 'A B',
    amount: 100,
    currency: 'usd',
    timestamp: '2026-01-14T00:00:00.000Z',
    stage: 'closedwon',
    url: 'https://example.com/d_x',
    ...overrides,
  };
}

const emptyMatch = { matched: [], review: [], unmatchedPayments: [], unmatchedDeals: [] };

describe('classify — clean fixture', () => {
  it('produces one PAYMENT_NO_DEAL (David Reyes), no exceptions for the 6 clean matches', () => {
    const matchResult = match(fixture.payments, fixture.deals, {});
    const exceptions = classify(matchResult, {});

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe('PAYMENT_NO_DEAL');
    expect(exceptions[0].payment.id).toBe('ch_007');
    expect(exceptions[0].unmatchable).toBe(false);
  });
});

describe('classify — ORPHAN_REFUND', () => {
  it('flags a matched pair where the payment is refunded but the deal is still closedwon', () => {
    const p = payment({ refunded: true });
    const d = deal({});
    const matchResult = { ...emptyMatch, matched: [{ payment: p, deal: d, confidence: 100, reasons: ['email_exact', 'amount_exact'] }] };

    const exceptions = classify(matchResult, {});

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe('ORPHAN_REFUND');
  });
});

describe('classify — partial refund is not an orphan', () => {
  it('a matched pair with refunded:false and a nonzero refundedAmount stays a clean match', () => {
    const p = payment({ amount: 2000, refunded: false, refundedAmount: 500 });
    const d = deal({ amount: 2000 });
    const matchResult = { ...emptyMatch, matched: [{ payment: p, deal: d, confidence: 100, reasons: ['email_exact', 'amount_exact'] }] };

    const exceptions = classify(matchResult, {});

    expect(exceptions).toHaveLength(0);
  });
});

describe('classify — AMOUNT_MISMATCH overrides plain REVIEW', () => {
  it('a review-band pair whose amount was only within 10% (not fee tolerance) becomes AMOUNT_MISMATCH', () => {
    const p = payment({ amount: 1800 });
    const d = deal({ amount: 2000 });
    const matchResult = { ...emptyMatch, review: [{ payment: p, deal: d, confidence: 70, reasons: ['email_exact', 'amount_within_10pct', 'timestamp_within_24h'] }] };

    const exceptions = classify(matchResult, {});

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe('AMOUNT_MISMATCH');
  });
});

describe('classify — plain REVIEW', () => {
  it('a review-band pair with no amount or refund issue stays REVIEW', () => {
    const p = payment({});
    const d = deal({});
    const matchResult = { ...emptyMatch, review: [{ payment: p, deal: d, confidence: 75, reasons: ['email_exact', 'amount_fee_adjusted'] }] };

    const exceptions = classify(matchResult, {});

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe('REVIEW');
  });
});

describe('classify — DEAL_NO_PAYMENT', () => {
  it('flags an unmatched closedwon deal', () => {
    const d = deal({ stage: 'closedwon' });
    const matchResult = { ...emptyMatch, unmatchedDeals: [d] };

    const exceptions = classify(matchResult, {});

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe('DEAL_NO_PAYMENT');
  });

  it('ignores an unmatched deal in any other stage', () => {
    const d = deal({ stage: 'negotiation' });
    const matchResult = { ...emptyMatch, unmatchedDeals: [d] };

    const exceptions = classify(matchResult, {});

    expect(exceptions).toHaveLength(0);
  });
});

describe('classify — PAYMENT_NO_DEAL', () => {
  it('flags an unmatched payment with no duplicate', () => {
    const p = payment({});
    const matchResult = { ...emptyMatch, unmatchedPayments: [p] };

    const exceptions = classify(matchResult, {});

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe('PAYMENT_NO_DEAL');
    expect(exceptions[0].unmatchable).toBe(false);
  });

  it('flags an unmatched payment with a null email as unmatchable', () => {
    const p = payment({ email: null });
    const matchResult = { ...emptyMatch, unmatchedPayments: [p] };

    const exceptions = classify(matchResult, {});

    expect(exceptions[0].unmatchable).toBe(true);
  });
});

describe('classify — DUPLICATE_CHARGE (Mike)', () => {
  it('flags the leftover charge as a duplicate of the one that took the deal, not PAYMENT_NO_DEAL', () => {
    const mikeDeal = deal({ id: 'd_mike', email: 'mike@co.com', amount: 500 });
    const chargeA = payment({ id: 'ch_a', email: 'mike@co.com', amount: 500, timestamp: '2026-01-14T10:00:00.000Z' });
    const chargeB = payment({ id: 'ch_b', email: 'mike@co.com', amount: 500, timestamp: '2026-01-14T10:10:00.000Z' });

    const matchResult = match([chargeA, chargeB], [mikeDeal], {});
    const exceptions = classify(matchResult, {});

    expect(exceptions).toHaveLength(1);
    expect(exceptions[0].type).toBe('DUPLICATE_CHARGE');
  });
});
