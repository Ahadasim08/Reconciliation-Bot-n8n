import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizeAmount, normalizeTimestamp } from "../src/normalize.js";

describe("normalizeEmail", () => {
  it("lowercases", () => {
    expect(normalizeEmail("Sarah.Chen@ACME.com")).toBe("sarah.chen@acme.com");
  });

  it("strips the plus-tag", () => {
    expect(normalizeEmail("jenna+billing@northstar.io")).toBe("jenna@northstar.io");
  });

  it("does NOT strip dots (deliberate — see DECISIONS.md)", () => {
    expect(normalizeEmail("j.smith@gmail.com")).toBe("j.smith@gmail.com");
  });

  it("trims whitespace", () => {
    expect(normalizeEmail("  sarah.chen@acme.com  ")).toBe("sarah.chen@acme.com");
  });

  it("returns null for null input", () => {
    expect(normalizeEmail(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("normalizeAmount", () => {
  it("converts Stripe cents to dollars", () => {
    expect(normalizeAmount(200000, "stripe")).toBe(2000.0);
  });

  it("coerces a HubSpot amount string to a number", () => {
    expect(normalizeAmount("2000", "hubspot")).toBe(2000.0);
  });

  it("returns null when the amount is missing (not $0)", () => {
    expect(normalizeAmount(null, "hubspot")).toBeNull();
  });

  it("rounds to cents, never leaves float drift", () => {
    expect(normalizeAmount(194050, "stripe")).toBe(1940.5);
  });
});

describe("normalizeTimestamp", () => {
  it("converts Stripe epoch seconds to UTC ISO8601", () => {
    expect(normalizeTimestamp(1705227272, "stripe")).toBe("2024-01-14T10:14:32.000Z");
  });

  it("converts a HubSpot epoch-millisecond string to UTC ISO8601", () => {
    expect(normalizeTimestamp("1705190400000", "hubspot")).toBe("2024-01-14T00:00:00.000Z");
  });

  it("returns null for missing timestamps", () => {
    expect(normalizeTimestamp(null, "stripe")).toBeNull();
  });
});
