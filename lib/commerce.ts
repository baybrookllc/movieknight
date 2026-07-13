// Commerce money math — pure functions, no I/O. All amounts are integer CENTS
// (never floats) to avoid rounding drift. The `tax_rates` table is the
// authoritative source for provincial rates at checkout; CA_TAX_RATES below
// mirrors it for client-side estimates and must be kept in sync with the
// 20260712000001_commerce_schema.sql seed.
//
// See ADAM_DOCS/commerce-vertical-plan.md (Phase P0).

/** Canadian combined sales-tax rates as fractions. Mirror of the DB seed. */
export const CA_TAX_RATES: Record<string, number> = {
  AB: 0.05,
  BC: 0.12,
  MB: 0.12,
  NB: 0.15,
  NL: 0.15,
  NS: 0.14,
  NT: 0.05,
  NU: 0.05,
  ON: 0.13,
  PE: 0.15,
  QC: 0.14975,
  SK: 0.11,
  YT: 0.05,
};

/** Look up a province's tax rate (fraction); 0 for unknown codes. */
export function taxRateForProvince(province: string): number {
  return CA_TAX_RATES[province?.toUpperCase()] ?? 0;
}

/** Sales tax in cents for a subtotal (cents) at a rate (fraction), rounded to the cent. */
export function computeTaxCents(subtotalCents: number, rate: number): number {
  if (subtotalCents <= 0 || rate <= 0) return 0;
  return Math.round(subtotalCents * rate);
}

// Flat base + per-additional-item shipping, free over a threshold. A weight- or
// carrier-based table can replace this later without touching callers.
export const SHIPPING_BASE_CENTS = 599;
export const SHIPPING_PER_EXTRA_ITEM_CENTS = 199;
export const FREE_SHIPPING_THRESHOLD_CENTS = 7500;

export function computeShippingCents(itemCount: number, subtotalCents: number): number {
  if (itemCount <= 0) return 0;
  if (subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS) return 0;
  return SHIPPING_BASE_CENTS + Math.max(0, itemCount - 1) * SHIPPING_PER_EXTRA_ITEM_CENTS;
}

export interface CartLine {
  unitPriceCents: number;
  quantity: number;
}

export function computeSubtotalCents(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
}

export interface OrderTotals {
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
}

/**
 * Full order totals for a set of cart lines and a destination tax rate
 * (fraction). Tax is applied to the goods subtotal for v1; per-province rules on
 * taxing shipping can be layered in later.
 */
export function computeOrderTotals(lines: CartLine[], taxRate: number): OrderTotals {
  const subtotalCents = computeSubtotalCents(lines);
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);
  const shippingCents = computeShippingCents(itemCount, subtotalCents);
  const taxCents = computeTaxCents(subtotalCents, taxRate);
  const totalCents = subtotalCents + taxCents + shippingCents;
  return { subtotalCents, taxCents, shippingCents, totalCents };
}

/** Format integer cents as a CAD currency string, e.g. 2499 → "$24.99". */
export function formatCad(cents: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
}
