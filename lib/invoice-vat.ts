/** New invoice examples include delivery in the taxable base; saved checkout snapshots stay unchanged. */
export function invoicePreviewTotals(subtotal: number, delivery: number, vatRate: number) {
  const taxAmount = Math.round((subtotal + delivery) * (vatRate / 100) * 100) / 100;
  return { taxAmount, total: Math.round((subtotal + delivery + taxAmount) * 100) / 100 };
}

/** Use the order's recorded rate, never today's market settings, on issued invoices. */
export function invoiceVatLabel(label: string, rate: number | undefined, locale: string) {
  if (rate == null || !Number.isFinite(rate) || rate < 0 || rate > 100) return label;
  return `${label} (${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(rate)}%)`;
}
