import { describe, it, expect } from 'vitest';
import { normalizeEmail, normalizeAmount, normalizeTimestamp } from '../src/normalize.js';

describe('normalizeEmail', () => {
  it('lowercases', () => {
    expect(normalizeEmail('Sarah.Chen@ACME.com')).toBe('sarah.chen@acme.com');
  });

  it('strips plus-tag', () => {
    expect(normalizeEmail('jenna+billing@northstar.io')).toBe('jenna@northstar.io');
  });

  it('does not strip dots', () => {
    expect(normalizeEmail('j.smith@gmail.com')).toBe('j.smith@gmail.com');
  });

  it('trims whitespace', () => {
    expect(normalizeEmail('  sarah@acme.com  ')).toBe('sarah@acme.com');
  });

  it('passes through null', () => {
    expect(normalizeEmail(null)).toBe(null);
  });
});

describe('normalizeAmount', () => {
  it('converts stripe cents to dollars', () => {
    expect(normalizeAmount(200000, 'stripe')).toBe(2000);
  });

  it('coerces hubspot string dollars to number', () => {
    expect(normalizeAmount('2000', 'hubspot')).toBe(2000);
  });

  it('passes through null (not 0)', () => {
    expect(normalizeAmount(null, 'hubspot')).toBe(null);
  });

  it('avoids float drift on stripe cents', () => {
    expect(normalizeAmount(194050, 'stripe')).toBe(1940.5);
  });
});

describe('normalizeTimestamp', () => {
  it('converts stripe unix seconds to UTC ISO8601', () => {
    expect(normalizeTimestamp(1705227272, 'stripe')).toBe('2024-01-14T10:14:32.000Z');
  });

  it('converts hubspot epoch millis to UTC ISO8601', () => {
    expect(normalizeTimestamp(1705227272000, 'hubspot')).toBe('2024-01-14T10:14:32.000Z');
  });

  it('passes through null', () => {
    expect(normalizeTimestamp(null, 'stripe')).toBe(null);
  });
});
