/**
 * Currency Constants
 *
 * ISO 4217 currency definitions with symbols, decimal places, and display names.
 * Used throughout the multi-currency engine for validation and formatting.
 */

export interface CurrencyDefinition {
  /** ISO 4217 3-letter code */
  code: string;
  /** Currency symbol (e.g., $, €, £) */
  symbol: string;
  /** Full name (e.g., "US Dollar") */
  name: string;
  /** Number of decimal places (e.g., 2 for USD, 0 for JPY) */
  decimals: number;
  /** Display sort order */
  sortOrder: number;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyDefinition> = {
  USD: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, sortOrder: 1 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, sortOrder: 2 },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2, sortOrder: 3 },
  CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', decimals: 2, sortOrder: 4 },
  MXN: { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', decimals: 2, sortOrder: 5 },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0, sortOrder: 6 },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2, sortOrder: 7 },
  CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', decimals: 2, sortOrder: 8 },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', decimals: 2, sortOrder: 9 },
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2, sortOrder: 10 },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2, sortOrder: 11 },
  KRW: { code: 'KRW', symbol: '₩', name: 'South Korean Won', decimals: 0, sortOrder: 12 },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2, sortOrder: 13 },
  HKD: { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2, sortOrder: 14 },
  NZD: { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2, sortOrder: 15 },
  SEK: { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', decimals: 2, sortOrder: 16 },
  NOK: { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', decimals: 2, sortOrder: 17 },
  DKK: { code: 'DKK', symbol: 'kr', name: 'Danish Krone', decimals: 2, sortOrder: 18 },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African Rand', decimals: 2, sortOrder: 19 },
  THB: { code: 'THB', symbol: '฿', name: 'Thai Baht', decimals: 2, sortOrder: 20 },
  AED: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', decimals: 2, sortOrder: 21 },
  PHP: { code: 'PHP', symbol: '₱', name: 'Philippine Peso', decimals: 2, sortOrder: 22 },
  COP: { code: 'COP', symbol: 'COL$', name: 'Colombian Peso', decimals: 2, sortOrder: 23 },
} as const;

/** All valid ISO 4217 currency codes */
export const CURRENCY_CODES = Object.keys(SUPPORTED_CURRENCIES);

/** Get currency symbol for a code, defaulting to the code itself */
export function getCurrencySymbol(code: string): string {
  return SUPPORTED_CURRENCIES[code]?.symbol ?? code;
}

/** Get number of decimal places for a currency (defaults to 2) */
export function getCurrencyDecimals(code: string): number {
  return SUPPORTED_CURRENCIES[code]?.decimals ?? 2;
}

/** Format a numeric amount according to the currency's decimal convention */
export function formatCurrencyAmount(amount: number | string, currencyCode: string): string {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  const decimals = getCurrencyDecimals(currencyCode);
  const symbol = getCurrencySymbol(currencyCode);
  const formatted = num.toFixed(decimals);
  return `${symbol}${formatted}`;
}

/** Check if a currency code is valid (in our supported list) */
export function isValidCurrency(code: string): boolean {
  return code in SUPPORTED_CURRENCIES;
}

/** Get sorted list of currency definitions */
export function getSortedCurrencies(): CurrencyDefinition[] {
  return Object.values(SUPPORTED_CURRENCIES).sort((a, b) => a.sortOrder - b.sortOrder);
}
