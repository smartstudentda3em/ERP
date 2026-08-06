export interface PricingLineInput {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
}

export interface PricingLineResult {
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  taxAmount: number;
  lineTotal: number;
}

export function computeLine(line: PricingLineInput): PricingLineResult {
  const grossAmount = line.quantity * line.unitPrice;
  const discountAmount = grossAmount * ((line.discountPercent ?? 0) / 100);
  const netAmount = grossAmount - discountAmount;
  const taxAmount = netAmount * ((line.taxPercent ?? 0) / 100);
  const lineTotal = netAmount + taxAmount;
  return { grossAmount, discountAmount, netAmount, taxAmount, lineTotal };
}

export interface DocumentTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
}

export function computeDocumentTotals(lines: PricingLineInput[]): DocumentTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    const result = computeLine(line);
    subtotal += result.netAmount;
    discountTotal += result.discountAmount;
    taxTotal += result.taxAmount;
  }
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return {
    subtotal: round(subtotal),
    discountTotal: round(discountTotal),
    taxTotal: round(taxTotal),
    grandTotal: round(subtotal + taxTotal),
  };
}
