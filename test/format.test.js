import { describe, it, expect } from 'vitest';
import { formatSlackMessage, formatSheetRows, summarize } from '../src/format.js';

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

describe('summarize', () => {
  it('zero exceptions: all payments clean', () => {
    const p = payment({});
    const d = deal({});
    const matchResult = { ...emptyMatch, matched: [{ payment: p, deal: d, confidence: 100, reasons: [] }] };

    const summary = summarize(matchResult, []);

    expect(summary).toEqual({ totalPayments: 1, cleanCount: 1, exceptionCount: 0, unreconciledAmount: 0 });
  });

  it('counts an exception against the total and pulls its amount into unreconciled', () => {
    const p = payment({ amount: 500 });
    const matchResult = { ...emptyMatch, unmatchedPayments: [p] };
    const exceptions = [{ type: 'PAYMENT_NO_DEAL', payment: p, unmatchable: false }];

    const summary = summarize(matchResult, exceptions);

    expect(summary).toEqual({ totalPayments: 1, cleanCount: 0, exceptionCount: 1, unreconciledAmount: 500 });
  });
});

describe('formatSlackMessage', () => {
  it('posts a headline even with zero exceptions — a silent bot is a broken bot', () => {
    const matchResult = { ...emptyMatch, matched: [{ payment: payment({}), deal: deal({}), confidence: 100, reasons: [] }] };

    const message = formatSlackMessage(matchResult, [], {});

    expect(message.blocks).toHaveLength(1);
    expect(message.blocks[0].text.text).toContain('1 payments · 1 clean · 0 exceptions · $0.00 unreconciled');
  });

  it('orders DUPLICATE_CHARGE and PAYMENT_NO_DEAL before REVIEW', () => {
    const review = { type: 'REVIEW', payment: payment({ id: 'ch_review' }), deal: deal({}), confidence: 70 };
    const dup = { type: 'DUPLICATE_CHARGE', payment: payment({ id: 'ch_dup' }), duplicateOf: payment({ id: 'ch_win' }) };
    const matchResult = { ...emptyMatch };

    const message = formatSlackMessage(matchResult, [review, dup], {});

    expect(message.blocks[1].text.text).toContain('DUPLICATE_CHARGE');
    expect(message.blocks[2].text.text).toContain('REVIEW');
  });

  it('caps at maxExceptionsInMessage and points to the sheet for the rest', () => {
    const exceptions = Array.from({ length: 12 }, (_, i) =>
      ({ type: 'PAYMENT_NO_DEAL', payment: payment({ id: `ch_${i}` }), unmatchable: false })
    );
    const matchResult = { ...emptyMatch, unmatchedPayments: exceptions.map((e) => e.payment) };

    const message = formatSlackMessage(matchResult, exceptions, { maxExceptionsInMessage: 10 });

    // 1 headline + 10 shown + 1 "…and N more" line
    expect(message.blocks).toHaveLength(12);
    expect(message.blocks[11].text.text).toBe('…and 2 more, see sheet.');
  });
});

describe('formatSheetRows', () => {
  it('maps an exception to a sheet row with both links when payment and deal exist', () => {
    const p = payment({ id: 'ch_1', url: 'https://stripe.example/ch_1' });
    const d = deal({ id: 'd_1', url: 'https://hubspot.example/d_1' });
    const exceptions = [{ type: 'AMOUNT_MISMATCH', payment: p, deal: d, confidence: 70 }];

    const rows = formatSheetRows(exceptions);

    expect(rows).toEqual([
      {
        date: p.timestamp,
        type: 'AMOUNT_MISMATCH',
        amount: p.amount,
        customer: p.name,
        email: p.email,
        confidence: 70,
        paymentLink: p.url,
        dealLink: d.url,
        resolved: false,
      },
    ]);
  });

  it('a payment-only exception (PAYMENT_NO_DEAL) has no dealLink and no confidence', () => {
    const p = payment({ id: 'ch_2' });
    const exceptions = [{ type: 'PAYMENT_NO_DEAL', payment: p, unmatchable: false }];

    const rows = formatSheetRows(exceptions);

    expect(rows[0].dealLink).toBeNull();
    expect(rows[0].confidence).toBeNull();
  });

  it('a deal-only exception (DEAL_NO_PAYMENT) has no paymentLink', () => {
    const d = deal({ id: 'd_2' });
    const exceptions = [{ type: 'DEAL_NO_PAYMENT', deal: d }];

    const rows = formatSheetRows(exceptions);

    expect(rows[0].paymentLink).toBeNull();
    expect(rows[0].date).toBe(d.timestamp);
  });

  it('neutralizes a customer name that would run as a spreadsheet formula', () => {
    const p = payment({ id: 'ch_3', name: '=HYPERLINK("https://evil.example","click")' });
    const exceptions = [{ type: 'PAYMENT_NO_DEAL', payment: p, unmatchable: false }];

    const rows = formatSheetRows(exceptions);

    expect(rows[0].customer.startsWith("'")).toBe(true);
  });

  it('leaves an ordinary customer name untouched', () => {
    const p = payment({ id: 'ch_4', name: 'Sarah Chen' });
    const exceptions = [{ type: 'PAYMENT_NO_DEAL', payment: p, unmatchable: false }];

    const rows = formatSheetRows(exceptions);

    expect(rows[0].customer).toBe('Sarah Chen');
  });
});

describe('formatSlackMessage — mrkdwn injection', () => {
  it('escapes &, <, > in a customer name before it reaches Slack block text', () => {
    const p = payment({ id: 'ch_5', name: 'Bob <http://evil.example|click here> & friends' });
    const matchResult = { ...emptyMatch, unmatchedPayments: [p] };
    const exceptions = [{ type: 'PAYMENT_NO_DEAL', payment: p, unmatchable: false }];

    const message = formatSlackMessage(matchResult, exceptions, {});

    const line = message.blocks[1].text.text;
    expect(line).not.toContain('<http://evil.example|click here>');
    expect(line).toContain('&lt;http://evil.example|click here&gt;');
    expect(line).toContain('&amp; friends');
  });
});
