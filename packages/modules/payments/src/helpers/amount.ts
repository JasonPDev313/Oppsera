/**
 * Convert cents (integer) to dollar string for provider APIs.
 * CardPointe expects amounts like "100.00" (string, dollars).
 */
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Convert dollar string from provider response to cents (integer).
 * CardPointe returns amounts like "100.00".
 */
export function dollarsToCents(dollars: string): number {
  return Math.round(parseFloat(dollars) * 100);
}

/**
 * Generate a provider-safe order ID.
 * CardPointe orderid: max 19 chars, alphanumeric.
 * We use a truncated ULID (26 chars → 19 chars).
 */
export function generateProviderOrderId(): string {
  // ULID is 26 chars, take first 19 for CardPointe compatibility
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const now = Date.now().toString(36).toUpperCase(); // ~8 chars
  const random = Array.from({ length: 19 - now.length }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length)),
  ).join('');
  return `${now}${random}`.slice(0, 19);
}

/**
 * Extract card last 4 digits from a CardSecure token.
 * CardSecure token format: "9" + first 2 digits + masked + last 4
 */
export function extractCardLast4(token: string): string | null {
  if (!token || token.length < 4) return null;
  return token.slice(-4);
}

/**
 * Detect card brand from BIN (first 6 digits of card number or token).
 * Returns: 'visa', 'mastercard', 'amex', 'discover', or 'unknown'
 */
export function detectCardBrand(bin: string): string {
  if (!bin || bin.length < 1) return 'unknown';
  const first = bin.charAt(0);
  const first2 = bin.slice(0, 2);
  const first4 = bin.slice(0, 4);

  if (first === '4') return 'visa';
  if (first2 === '34' || first2 === '37') return 'amex';
  if (first === '5' || first2 === '22' || first2 === '23' || first2 === '24' || first2 === '25' || first2 === '26' || first2 === '27') return 'mastercard';
  if (first4 === '6011' || first2 === '65' || first2 === '64') return 'discover';
  return 'unknown';
}
