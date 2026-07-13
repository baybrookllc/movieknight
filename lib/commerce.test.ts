import { describe, it, expect } from 'vitest';
import {
  CA_TAX_RATES,
  taxRateForProvince,
  computeTaxCents,
  computeShippingCents,
  computeSubtotalCents,
  computeOrderTotals,
  formatCad,
  SHIPPING_BASE_CENTS,
  SHIPPING_PER_EXTRA_ITEM_CENTS,
  FREE_SHIPPING_THRESHOLD_CENTS,
} from './commerce';

describe('CA_TAX_RATES', () => {
  it('covers all 13 provinces/territories', () => {
    expect(Object.keys(CA_TAX_RATES)).toHaveLength(13);
  });
  it('has plausible fractional rates (0–20%)', () => {
    for (const rate of Object.values(CA_TAX_RATES)) {
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(0.2);
    }
  });
});

describe('taxRateForProvince', () => {
  it('is case-insensitive and returns the fraction', () => {
    expect(taxRateForProvince('ON')).toBe(0.13);
    expect(taxRateForProvince('on')).toBe(0.13);
  });
  it('returns 0 for unknown/empty codes', () => {
    expect(taxRateForProvince('ZZ')).toBe(0);
    expect(taxRateForProvince('')).toBe(0);
  });
});

describe('computeTaxCents', () => {
  it('rounds to the nearest cent', () => {
    expect(computeTaxCents(10000, 0.13)).toBe(1300); // ON on $100
    expect(computeTaxCents(2499, 0.13)).toBe(325);   // 324.87 -> 325
  });
  it('handles QC 14.975% precisely (rounded)', () => {
    expect(computeTaxCents(10000, 0.14975)).toBe(1498); // 1497.5 -> 1498
  });
  it('is 0 for non-positive subtotal or rate', () => {
    expect(computeTaxCents(0, 0.13)).toBe(0);
    expect(computeTaxCents(1000, 0)).toBe(0);
    expect(computeTaxCents(-500, 0.13)).toBe(0);
  });
});

describe('computeShippingCents', () => {
  it('is 0 for an empty cart', () => {
    expect(computeShippingCents(0, 0)).toBe(0);
  });
  it('charges base for one item, plus per extra item', () => {
    expect(computeShippingCents(1, 2499)).toBe(SHIPPING_BASE_CENTS);
    expect(computeShippingCents(3, 5000)).toBe(SHIPPING_BASE_CENTS + 2 * SHIPPING_PER_EXTRA_ITEM_CENTS);
  });
  it('is free at/above the free-shipping threshold', () => {
    expect(computeShippingCents(2, FREE_SHIPPING_THRESHOLD_CENTS)).toBe(0);
    expect(computeShippingCents(5, FREE_SHIPPING_THRESHOLD_CENTS + 1)).toBe(0);
  });
});

describe('computeSubtotalCents', () => {
  it('sums unit price * quantity across lines', () => {
    expect(computeSubtotalCents([
      { unitPriceCents: 2499, quantity: 2 },
      { unitPriceCents: 1000, quantity: 1 },
    ])).toBe(5998);
  });
  it('is 0 for an empty cart', () => {
    expect(computeSubtotalCents([])).toBe(0);
  });
});

describe('computeOrderTotals', () => {
  it('composes subtotal + tax + shipping into a consistent total', () => {
    const t = computeOrderTotals([{ unitPriceCents: 2499, quantity: 1 }], 0.13);
    expect(t.subtotalCents).toBe(2499);
    expect(t.taxCents).toBe(325);
    expect(t.shippingCents).toBe(SHIPPING_BASE_CENTS);
    expect(t.totalCents).toBe(2499 + 325 + SHIPPING_BASE_CENTS);
  });
  it('applies free shipping to a large order', () => {
    const t = computeOrderTotals([{ unitPriceCents: 10000, quantity: 1 }], 0.05);
    expect(t.shippingCents).toBe(0);
    expect(t.totalCents).toBe(10000 + 500); // subtotal + AB tax, no shipping
  });
  it('is all zeros for an empty cart', () => {
    expect(computeOrderTotals([], 0.13)).toEqual({
      subtotalCents: 0, taxCents: 0, shippingCents: 0, totalCents: 0,
    });
  });
});

describe('formatCad', () => {
  it('formats cents as CAD', () => {
    // Intl may use a non-breaking space; assert on the meaningful parts.
    const s = formatCad(2499);
    expect(s).toContain('24.99');
    expect(s).toContain('$');
  });
});
