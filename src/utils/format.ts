/**
 * Refunds, reversed purchases, and settled insurance claims are tracked as
 * negative amounts (see transactionParser.ts / sms.ts classifyTransaction)
 * so every sum nets them out automatically. This is the one place that
 * turns that sign back into something readable — "−₹500.00" rather than
 * the default "₹-500.00" a naive template literal would produce.
 */
export function formatSignedAmount(amount: number, decimals: number = 2): string {
    const sign = amount < 0 ? '−' : '';
    return `${sign}₹${Math.abs(amount).toFixed(decimals)}`;
}
