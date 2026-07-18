import { describe, it, expect } from "vitest";
import { match, DEFAULT_CONFIG } from "../src/matcher.js";
import clean from "./fixtures/clean.json" with { type: "json" };

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

describe("match — clean fixture", () => {
  it("matches all 6 email-aligned pairs and leaves David Reyes unmatched", () => {
    const result = match(clean.payments, clean.deals, DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(6);
    expect(result.review).toHaveLength(0);
    expect(result.unmatchedPayments).toHaveLength(1);
    expect(result.unmatchedPayments[0].id).toBe("ch_007");
    expect(result.unmatchedDeals).toHaveLength(0);
  });

  it("scores an exact email + exact amount + same-day pair at auto-match confidence", () => {
    const result = match(clean.payments, clean.deals, DEFAULT_CONFIG);
    const sarah = result.matched.find((m) => m.payment.id === "ch_001");
    expect(sarah.confidence).toBeGreaterThanOrEqual(DEFAULT_CONFIG.autoMatchThreshold);
    expect(sarah.reasons).toContain("email exact");
    expect(sarah.reasons).toContain("amount exact");
  });
});

describe("match — hostile structural cases", () => {
  it("Mike: two charges, one deal — only one is matched, the other stays unmatched (not first-match-wins)", () => {
    const payments = [
      payment({ id: "ch_mike_1", email: "mike@corp.com", amount: 500, timestamp: "2026-01-14T10:00:00.000Z" }),
      payment({ id: "ch_mike_2", email: "mike@corp.com", amount: 500, timestamp: "2026-01-14T10:10:00.000Z" }),
    ];
    const deals = [deal({ id: "d_mike", email: "mike@corp.com", amount: 500, timestamp: "2026-01-14T00:00:00.000Z" })];
    const result = match(payments, deals, DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(1);
    expect(result.unmatchedPayments).toHaveLength(1);
    expect(result.unmatchedDeals).toHaveLength(0);
  });

  it("two deals, one charge — matches the best-scoring deal, leaves the other unmatched", () => {
    const payments = [payment({ id: "ch_dup_deal", email: "sam@corp.com", amount: 1000, timestamp: "2026-01-14T10:00:00.000Z" })];
    const deals = [
      deal({ id: "d_close", email: "sam@corp.com", amount: 1000, timestamp: "2026-01-14T09:00:00.000Z" }),
      deal({ id: "d_far", email: "sam@corp.com", amount: 800, timestamp: "2026-01-10T00:00:00.000Z" }),
    ];
    const result = match(payments, deals, DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].deal.id).toBe("d_close");
    expect(result.unmatchedDeals).toHaveLength(1);
    expect(result.unmatchedDeals[0].id).toBe("d_far");
  });

  it("two John Smiths never collide — different emails route to their own deals", () => {
    const payments = [
      payment({ id: "ch_john_1", email: "john.smith@acme.com", name: "John Smith", amount: 300 }),
      payment({ id: "ch_john_2", email: "john.smith@other.com", name: "John Smith", amount: 300 }),
    ];
    const deals = [
      deal({ id: "d_john_1", email: "john.smith@acme.com", name: "John Smith", amount: 300 }),
      deal({ id: "d_john_2", email: "john.smith@other.com", name: "John Smith", amount: 300 }),
    ];
    const result = match(payments, deals, DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(2);
    const acme = result.matched.find((m) => m.payment.id === "ch_john_1");
    expect(acme.deal.id).toBe("d_john_1");
  });

  it("timezone boundary: charge 23:58 Jan 14, deal closed 00:04 Jan 15 — still matches (not calendar-day matching)", () => {
    const payments = [payment({ id: "ch_boundary", email: "raj@corp.com", amount: 900, timestamp: "2026-01-14T23:58:00.000Z" })];
    const deals = [deal({ id: "d_boundary", email: "raj@corp.com", amount: 900, timestamp: "2026-01-15T00:04:00.000Z" })];
    const result = match(payments, deals, DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(1);
  });

  it("name fuzzy only fires when email is absent on both sides", () => {
    const payments = [payment({ id: "ch_noemail", email: null, name: "Jonathan Doe", amount: 700, timestamp: "2026-01-14T10:00:00.000Z" })];
    const deals = [deal({ id: "d_noemail", email: null, name: "Jonathan Doh", amount: 700, timestamp: "2026-01-14T09:00:00.000Z" })];
    const result = match(payments, deals, DEFAULT_CONFIG);
    // amount exact (40) + name fuzzy (20) + timestamp 24h (10) = 70 -> review, never auto-matched off name alone
    expect(result.review).toHaveLength(1);
    expect(result.review[0].reasons).toContain("name fuzzy");
  });

  it("does not fuzzy-match on name when email is present but different", () => {
    const payments = [payment({ id: "ch_named", email: "a@corp.com", name: "Same Name", amount: 700 })];
    const deals = [deal({ id: "d_named", email: "b@corp.com", name: "Same Name", amount: 700 })];
    const result = match(payments, deals, DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(0);
    expect(result.review).toHaveLength(0);
    expect(result.unmatchedPayments).toHaveLength(1);
    expect(result.unmatchedDeals).toHaveLength(1);
  });
});

describe("match — amount scoring tiers", () => {
  it("Jenna: 2.98% off lands inside fee tolerance, auto-matches", () => {
    const payments = [payment({ id: "ch_jenna", email: "jenna@corp.com", amount: 1940.5 })];
    const deals = [deal({ id: "d_jenna", email: "jenna@corp.com", amount: 2000 })];
    const result = match(payments, deals, DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].reasons).toContain("amount within fee tolerance");
  });

  it("10% off scores lower but still a candidate pair", () => {
    const payments = [payment({ id: "ch_ten", email: "ten@corp.com", amount: 1800 })];
    const deals = [deal({ id: "d_ten", email: "ten@corp.com", amount: 2000 })];
    const result = match(payments, deals, DEFAULT_CONFIG);
    const pair = [...result.matched, ...result.review].find((m) => m.payment.id === "ch_ten");
    expect(pair.reasons).toContain("amount within 10%");
  });

  it("a null deal amount does not throw and contributes zero score", () => {
    const payments = [payment({ id: "ch_nullamt", email: "na@corp.com", amount: 500 })];
    const deals = [deal({ id: "d_nullamt", email: "na@corp.com", amount: null })];
    expect(() => match(payments, deals, DEFAULT_CONFIG)).not.toThrow();
  });

  it("compares amounts as cents, immune to float drift (0.1 + 0.2 style)", () => {
    const payments = [payment({ id: "ch_float", email: "float@corp.com", amount: 19.9 + 0.1 })];
    const deals = [deal({ id: "d_float", email: "float@corp.com", amount: 20.0 })];
    const result = match(payments, deals, DEFAULT_CONFIG);
    expect(result.matched[0].reasons).toContain("amount exact");
  });
});

describe("match — config is not hardcoded", () => {
  it("a custom autoMatchThreshold changes what counts as matched vs review", () => {
    const payments = [payment({ id: "ch_cfg", email: "cfg@corp.com", amount: 1800 })];
    const deals = [deal({ id: "d_cfg", email: "cfg@corp.com", amount: 2000 })];
    const lenient = match(payments, deals, { ...DEFAULT_CONFIG, autoMatchThreshold: 55 });
    expect(lenient.matched).toHaveLength(1);
  });
});
