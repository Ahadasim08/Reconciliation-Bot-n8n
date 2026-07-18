import { describe, it, expect } from "vitest";
import { classify } from "../src/classify.js";

function payment(overrides) {
  return {
    source: "stripe",
    id: "ch_x",
    email: "x@example.com",
    name: "X Person",
    amount: 500,
    currency: "usd",
    timestamp: "2026-01-14T10:00:00.000Z",
    refunded: false,
    refundedAmount: 0,
    url: "https://example.com",
    ...overrides,
  };
}

function deal(overrides) {
  return {
    source: "hubspot",
    id: "d_x",
    email: "x@example.com",
    name: "X Person",
    amount: 500,
    currency: "usd",
    timestamp: "2026-01-14T00:00:00.000Z",
    stage: "closedwon",
    url: "https://example.com",
    ...overrides,
  };
}

function matcherResult(overrides) {
  return { matched: [], review: [], unmatchedPayments: [], unmatchedDeals: [], ...overrides };
}

describe("classify — unmatched payments", () => {
  it("plain unmatched payment becomes PAYMENT_NO_DEAL", () => {
    const result = classify(matcherResult({ unmatchedPayments: [payment({ id: "ch_1" })] }));
    expect(result.exceptions).toEqual([
      expect.objectContaining({ type: "PAYMENT_NO_DEAL", charge_id: "ch_1" }),
    ]);
  });

  it("unmatched payment with no email is flagged unmatchable", () => {
    const result = classify(matcherResult({ unmatchedPayments: [payment({ id: "ch_2", email: null })] }));
    expect(result.exceptions[0].detail.reasons).toContain("unmatchable — no email");
  });
});

describe("classify — unmatched deals", () => {
  it("unmatched closedwon deal becomes DEAL_NO_PAYMENT", () => {
    const result = classify(matcherResult({ unmatchedDeals: [deal({ id: "d_1", stage: "closedwon" })] }));
    expect(result.exceptions).toEqual([
      expect.objectContaining({ type: "DEAL_NO_PAYMENT", deal_id: "d_1" }),
    ]);
  });

  it("unmatched open-stage deal is ignored, not an exception", () => {
    const result = classify(matcherResult({ unmatchedDeals: [deal({ id: "d_2", stage: "negotiation" })] }));
    expect(result.exceptions).toHaveLength(0);
  });
});

describe("classify — duplicate charges", () => {
  it("two unmatched payments, same email/amount, 10 min apart -> both DUPLICATE_CHARGE, linked", () => {
    const a = payment({ id: "ch_mike_1", email: "mike@corp.com", amount: 500, timestamp: "2026-01-14T10:00:00.000Z" });
    const b = payment({ id: "ch_mike_2", email: "mike@corp.com", amount: 500, timestamp: "2026-01-14T10:10:00.000Z" });
    const result = classify(matcherResult({ unmatchedPayments: [a, b] }));
    expect(result.exceptions).toHaveLength(2);
    expect(result.exceptions.every((e) => e.type === "DUPLICATE_CHARGE")).toBe(true);
    expect(result.exceptions[0].detail.linkedChargeId).toBe("ch_mike_2");
    expect(result.exceptions[1].detail.linkedChargeId).toBe("ch_mike_1");
  });

  it("same email/amount but outside the duplicate window -> PAYMENT_NO_DEAL, not a duplicate", () => {
    const a = payment({ id: "ch_a", email: "late@corp.com", amount: 500, timestamp: "2026-01-14T10:00:00.000Z" });
    const b = payment({ id: "ch_b", email: "late@corp.com", amount: 500, timestamp: "2026-01-14T11:10:00.000Z" });
    const result = classify(matcherResult({ unmatchedPayments: [a, b] }));
    expect(result.exceptions).toHaveLength(2);
    expect(result.exceptions.every((e) => e.type === "PAYMENT_NO_DEAL")).toBe(true);
  });
});

describe("classify — matched pairs", () => {
  it("fully refunded charge, deal still closedwon -> ORPHAN_REFUND", () => {
    const p = payment({ id: "ch_tom", amount: 1100, refunded: true, refundedAmount: 1100 });
    const d = deal({ id: "d_tom", amount: 1100, stage: "closedwon" });
    const result = classify(matcherResult({ matched: [{ payment: p, deal: d, confidence: 95, reasons: [] }] }));
    expect(result.exceptions).toEqual([
      expect.objectContaining({ type: "ORPHAN_REFUND", charge_id: "ch_tom", deal_id: "d_tom" }),
    ]);
  });

  it("partial refund on original-amount match -> no exception (not an orphan)", () => {
    const p = payment({ id: "ch_partial", amount: 2000, refunded: true, refundedAmount: 500 });
    const d = deal({ id: "d_partial", amount: 2000, stage: "closedwon" });
    const result = classify(matcherResult({ matched: [{ payment: p, deal: d, confidence: 95, reasons: [] }] }));
    expect(result.exceptions).toHaveLength(0);
  });

  it("amounts differ beyond fee tolerance -> AMOUNT_MISMATCH", () => {
    const p = payment({ id: "ch_mismatch", amount: 1800 });
    const d = deal({ id: "d_mismatch", amount: 2000 });
    const result = classify(matcherResult({ matched: [{ payment: p, deal: d, confidence: 90, reasons: [] }] }));
    expect(result.exceptions).toEqual([
      expect.objectContaining({ type: "AMOUNT_MISMATCH", charge_id: "ch_mismatch" }),
    ]);
  });

  it("amounts within fee tolerance do not fire AMOUNT_MISMATCH", () => {
    const p = payment({ id: "ch_jenna", amount: 1940.5 });
    const d = deal({ id: "d_jenna", amount: 2000 });
    const result = classify(matcherResult({ matched: [{ payment: p, deal: d, confidence: 90, reasons: [] }] }));
    expect(result.exceptions).toHaveLength(0);
  });
});

describe("classify — review passthrough", () => {
  it("review pairs from the matcher pass through untouched", () => {
    const p = payment({ id: "ch_review" });
    const d = deal({ id: "d_review" });
    const reviewItem = { payment: p, deal: d, confidence: 70, reasons: ["amount within 10%"] };
    const result = classify(matcherResult({ review: [reviewItem] }));
    expect(result.review).toEqual([reviewItem]);
  });
});
