import { describe, it, expect } from 'vitest';
import { match } from '../src/matcher.js';
import fixture from './fixtures/clean.json' with { type: 'json' };

describe('match', () => {
  it('returns the four-bucket shape, empty, for the stub', () => {
    const result = match(fixture.payments, fixture.deals, {});
    expect(result).toEqual({
      matched: [],
      review: [],
      unmatchedPayments: [],
      unmatchedDeals: [],
    });
  });
});
