import { describe, it, expect } from 'vitest';
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

describe('match — clean fixture', () => {
  it('matches all 6 clean pairs, leaves David Reyes unmatched', () => {
    const result = match(fixture.payments, fixture.deals, {});
    expect(result.matched).toHaveLength(6);
    expect(result.review).toHaveLength(0);
    expect(result.unmatchedDeals).toHaveLength(0);
    expect(result.unmatchedPayments).toHaveLength(1);
    expect(result.unmatchedPayments[0].id).toBe('ch_007');
  });
});

describe('match — duplicate charge (Mike)', () => {
  it('assigns the deal to the better-scoring charge, leaves the other unmatched (not the deal)', () => {
    const mikeDeal = deal({ id: 'd_mike', email: 'mike@co.com', name: 'Mike', amount: 500, timestamp: '2026-01-14T00:00:00.000Z' });
    const chargeA = payment({ id: 'ch_a', email: 'mike@co.com', name: 'Mike', amount: 500, timestamp: '2026-01-14T10:00:00.000Z' });
    const chargeB = payment({ id: 'ch_b', email: 'mike@co.com', name: 'Mike', amount: 500, timestamp: '2026-01-14T10:10:00.000Z' });

    const result = match([chargeA, chargeB], [mikeDeal], {});

    expect(result.matched).toHaveLength(1);
    expect(result.unmatchedDeals).toHaveLength(0);
    expect(result.unmatchedPayments).toHaveLength(1);
  });
});

describe('match — two deals, one charge', () => {
  it('matches the best-scoring deal, leaves the other deal unmatched', () => {
    const charge = payment({ id: 'ch_close', email: 'x@y.com', amount: 1000, timestamp: '2026-01-14T10:00:00.000Z' });
    const closeDeal = deal({ id: 'd_exact', email: 'x@y.com', amount: 1000, timestamp: '2026-01-14T00:00:00.000Z' });
    const farDeal = deal({ id: 'd_off', email: 'x@y.com', amount: 800, timestamp: '2026-01-10T00:00:00.000Z' });

    const result = match([charge], [closeDeal, farDeal], {});

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].deal.id).toBe('d_exact');
    expect(result.unmatchedDeals).toHaveLength(1);
    expect(result.unmatchedDeals[0].id).toBe('d_off');
  });
});

describe('match — amount mismatch lands in review, not matched', () => {
  it('80% amount score keeps confidence in the 60-84 band', () => {
    const charge = payment({ email: 'r@s.com', amount: 1800, timestamp: '2026-01-14T10:00:00.000Z' });
    const d = deal({ email: 'r@s.com', amount: 2000, timestamp: '2026-01-14T00:00:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.matched).toHaveLength(0);
    expect(result.review).toHaveLength(1);
    expect(result.review[0].confidence).toBe(70);
  });
});

describe('match — fee-adjusted amount (Jenna)', () => {
  it('2.98% off matches at confidence 85 via fee tolerance', () => {
    const charge = payment({ email: 'jenna@northstar.io', amount: 1940.5, timestamp: '2026-01-14T10:00:00.000Z' });
    const d = deal({ email: 'jenna@northstar.io', amount: 2000, timestamp: '2026-01-14T00:00:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBe(85);
    expect(result.matched[0].reasons).toContain('amount_fee_adjusted');
  });
});

describe('match — timezone boundary', () => {
  it('charge 23:58 Jan 14 vs deal 00:04 Jan 15 still matches (6 minutes apart)', () => {
    const charge = payment({ email: 'raj@co.com', amount: 500, timestamp: '2026-01-14T23:58:00.000Z' });
    const d = deal({ email: 'raj@co.com', amount: 500, timestamp: '2026-01-15T00:04:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.matched).toHaveLength(1);
  });
});

describe('match — same name, different people never collide', () => {
  it('two John Smiths with different emails match their own deals independently', () => {
    const chargeA = payment({ id: 'ch_js1', email: 'john.smith1@a.com', name: 'John Smith', amount: 500, timestamp: '2026-01-14T10:00:00.000Z' });
    const chargeB = payment({ id: 'ch_js2', email: 'john.smith2@b.com', name: 'John Smith', amount: 700, timestamp: '2026-01-14T11:00:00.000Z' });
    const dealA = deal({ id: 'd_js1', email: 'john.smith1@a.com', name: 'John Smith', amount: 500, timestamp: '2026-01-14T00:00:00.000Z' });
    const dealB = deal({ id: 'd_js2', email: 'john.smith2@b.com', name: 'John Smith', amount: 700, timestamp: '2026-01-14T00:00:00.000Z' });

    const result = match([chargeA, chargeB], [dealA, dealB], {});

    expect(result.matched).toHaveLength(2);
    expect(result.matched.find((m) => m.payment.id === 'ch_js1').deal.id).toBe('d_js1');
    expect(result.matched.find((m) => m.payment.id === 'ch_js2').deal.id).toBe('d_js2');
  });
});

describe('match — CRM lag', () => {
  it('deal closed 3 days after payment still matches on email + amount alone', () => {
    const charge = payment({ email: 'lag@co.com', amount: 900, timestamp: '2026-01-14T10:00:00.000Z' });
    const d = deal({ email: 'lag@co.com', amount: 900, timestamp: '2026-01-17T00:00:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].confidence).toBe(90);
    expect(result.matched[0].reasons).not.toContain('timestamp_within_24h');
    expect(result.matched[0].reasons).not.toContain('timestamp_within_48h');
  });
});

describe('match — float-safe amount comparison', () => {
  it('does not misfire on classic float drift (0.1 + 0.2)', () => {
    const charge = payment({ email: 'float@co.com', amount: 0.3, timestamp: '2026-01-14T10:00:00.000Z' });
    const d = deal({ email: 'float@co.com', amount: 0.1 + 0.2, timestamp: '2026-01-14T00:00:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].reasons).toContain('amount_exact');
  });
});

describe('match — currency mismatch never silently compares', () => {
  it('does not match a EUR charge against a USD deal even with identical amount and email', () => {
    const charge = payment({ email: 'cur@co.com', amount: 1000, currency: 'eur', timestamp: '2026-01-14T10:00:00.000Z' });
    const d = deal({ email: 'cur@co.com', amount: 1000, currency: 'usd', timestamp: '2026-01-14T00:00:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.matched).toHaveLength(0);
    expect(result.review).toHaveLength(0);
    expect(result.unmatchedPayments).toHaveLength(1);
    expect(result.unmatchedDeals).toHaveLength(1);
  });
});

describe('match — amount beyond all tolerance tiers is tagged, not silently dropped', () => {
  it('a 50% partial payment still pairs via email+timestamp and is tagged amount_mismatch', () => {
    const charge = payment({ email: 'partial@co.com', amount: 1000, timestamp: '2026-01-14T10:00:00.000Z' });
    const d = deal({ email: 'partial@co.com', amount: 2000, timestamp: '2026-01-14T00:00:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.review).toHaveLength(1);
    expect(result.review[0].confidence).toBe(60);
    expect(result.review[0].reasons).toContain('amount_mismatch');
  });
});

describe('match — null deal amount', () => {
  it('skips amount scoring entirely, does not treat null as 0 or crash', () => {
    const charge = payment({ email: 'nullamt@co.com', amount: 500, timestamp: '2026-01-14T10:00:00.000Z' });
    const d = deal({ email: 'nullamt@co.com', amount: null, timestamp: '2026-01-14T00:00:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.review).toHaveLength(1);
    expect(result.review[0].confidence).toBe(60);
    expect(result.review[0].reasons).not.toContain('amount_mismatch');
  });
});

describe('match — clock skew', () => {
  it('a charge timestamped in the future is still scored and paired, not dropped', () => {
    const charge = payment({ email: 'future@co.com', amount: 500, timestamp: '2099-01-01T00:00:00.000Z' });
    const d = deal({ email: 'future@co.com', amount: 500, timestamp: '2099-01-01T00:04:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.matched).toHaveLength(1);
  });
});

describe('match — name-fuzzy fallback when both emails are null', () => {
  it('matches on close name when neither side has an email', () => {
    const charge = payment({ email: null, name: 'Jonathan Doe', amount: 500, timestamp: '2026-01-14T10:00:00.000Z' });
    const d = deal({ email: null, name: 'Jonathon Doe', amount: 500, timestamp: '2026-01-14T00:00:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.review.length + result.matched.length).toBe(1);
  });

  it('does not pair a null-email payment with an emailed deal', () => {
    const charge = payment({ email: null, name: 'Jonathan Doe', amount: 500, timestamp: '2026-01-14T10:00:00.000Z' });
    const d = deal({ email: 'someone@else.com', name: 'Jonathan Doe', amount: 500, timestamp: '2026-01-14T00:00:00.000Z' });

    const result = match([charge], [d], {});

    expect(result.matched).toHaveLength(0);
    expect(result.review).toHaveLength(0);
    expect(result.unmatchedPayments).toHaveLength(1);
    expect(result.unmatchedDeals).toHaveLength(1);
  });
});
