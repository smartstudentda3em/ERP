import { computeDocumentTotals, computeLine } from './pricing';

describe('pricing utils', () => {
  it('computes a line with no discount or tax', () => {
    const result = computeLine({ quantity: 2, unitPrice: 10 });
    expect(result.grossAmount).toBe(20);
    expect(result.discountAmount).toBe(0);
    expect(result.netAmount).toBe(20);
    expect(result.taxAmount).toBe(0);
    expect(result.lineTotal).toBe(20);
  });

  it('applies discount before tax', () => {
    const result = computeLine({ quantity: 1, unitPrice: 100, discountPercent: 10, taxPercent: 14 });
    expect(result.netAmount).toBeCloseTo(90);
    expect(result.taxAmount).toBeCloseTo(12.6);
    expect(result.lineTotal).toBeCloseTo(102.6);
  });

  it('aggregates document totals across multiple lines', () => {
    const totals = computeDocumentTotals([
      { quantity: 2, unitPrice: 50, taxPercent: 14 },
      { quantity: 1, unitPrice: 100, discountPercent: 5, taxPercent: 14 },
    ]);
    // line1: net 100, tax 14 -> total 114
    // line2: net 95, tax 13.3 -> total 108.3
    expect(totals.subtotal).toBeCloseTo(195);
    expect(totals.taxTotal).toBeCloseTo(27.3);
    expect(totals.grandTotal).toBeCloseTo(222.3);
  });
});
