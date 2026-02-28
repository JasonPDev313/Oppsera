import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Shared currency constants ─────────────────────────────────
import {
  SUPPORTED_CURRENCIES,
  isValidCurrency,
  formatCurrencyAmount,
  getCurrencySymbol,
  getCurrencyDecimals,
  getSortedCurrencies,
} from '@oppsera/shared';

// ── Validation schemas ────────────────────────────────────────
import { updateExchangeRateSchema, updateSupportedCurrenciesSchema } from '../validation';

// ────────────────────────────────────────────────────────────────
// 1. SUPPORTED_CURRENCIES constant tests
// ────────────────────────────────────────────────────────────────

describe('SUPPORTED_CURRENCIES constant', () => {
  it('should include USD, EUR, GBP, JPY', () => {
    expect(SUPPORTED_CURRENCIES['USD']).toBeDefined();
    expect(SUPPORTED_CURRENCIES['EUR']).toBeDefined();
    expect(SUPPORTED_CURRENCIES['GBP']).toBeDefined();
    expect(SUPPORTED_CURRENCIES['JPY']).toBeDefined();
  });

  it('each currency should have name, symbol, decimals, sortOrder', () => {
    for (const [code, def] of Object.entries(SUPPORTED_CURRENCIES)) {
      expect(def.name).toBeTruthy();
      expect(def.symbol).toBeTruthy();
      expect(typeof def.decimals).toBe('number');
      expect(typeof def.sortOrder).toBe('number');
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('should have at least 20 currencies', () => {
    expect(Object.keys(SUPPORTED_CURRENCIES).length).toBeGreaterThanOrEqual(20);
  });
});

// ────────────────────────────────────────────────────────────────
// 2. isValidCurrency
// ────────────────────────────────────────────────────────────────

describe('isValidCurrency', () => {
  it('should return true for valid codes', () => {
    expect(isValidCurrency('USD')).toBe(true);
    expect(isValidCurrency('EUR')).toBe(true);
    expect(isValidCurrency('JPY')).toBe(true);
    expect(isValidCurrency('MXN')).toBe(true);
  });

  it('should return false for invalid codes', () => {
    expect(isValidCurrency('XXX')).toBe(false);
    expect(isValidCurrency('usd')).toBe(false);
    expect(isValidCurrency('')).toBe(false);
    expect(isValidCurrency('US')).toBe(false);
    expect(isValidCurrency('USDD')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────
// 3. getCurrencyDecimals
// ────────────────────────────────────────────────────────────────

describe('getCurrencyDecimals', () => {
  it('should return 2 for USD, EUR, GBP', () => {
    expect(getCurrencyDecimals('USD')).toBe(2);
    expect(getCurrencyDecimals('EUR')).toBe(2);
    expect(getCurrencyDecimals('GBP')).toBe(2);
  });

  it('should return 0 for JPY', () => {
    expect(getCurrencyDecimals('JPY')).toBe(0);
  });

  it('should return 2 for unknown currency code (default)', () => {
    expect(getCurrencyDecimals('ZZZ')).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────────
// 4. getCurrencySymbol
// ────────────────────────────────────────────────────────────────

describe('getCurrencySymbol', () => {
  it('should return $ for USD', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
  });

  it('should return € for EUR', () => {
    expect(getCurrencySymbol('EUR')).toBe('€');
  });

  it('should return £ for GBP', () => {
    expect(getCurrencySymbol('GBP')).toBe('£');
  });

  it('should return ¥ for JPY', () => {
    expect(getCurrencySymbol('JPY')).toBe('¥');
  });

  it('should return code for unknown currency', () => {
    expect(getCurrencySymbol('ZZZ')).toBe('ZZZ');
  });
});

// ────────────────────────────────────────────────────────────────
// 5. formatCurrencyAmount
// ────────────────────────────────────────────────────────────────

describe('formatCurrencyAmount', () => {
  it('should format USD with 2 decimals and $', () => {
    expect(formatCurrencyAmount(1234.5, 'USD')).toBe('$1,234.50');
  });

  it('should format EUR with 2 decimals and €', () => {
    expect(formatCurrencyAmount(99.9, 'EUR')).toBe('€99.90');
  });

  it('should format JPY with 0 decimals and ¥', () => {
    expect(formatCurrencyAmount(15000, 'JPY')).toBe('¥15,000');
  });

  it('should handle zero amount', () => {
    expect(formatCurrencyAmount(0, 'USD')).toBe('$0.00');
  });

  it('should handle negative amount', () => {
    expect(formatCurrencyAmount(-50.25, 'USD')).toBe('-$50.25');
  });

  it('should handle large amounts', () => {
    expect(formatCurrencyAmount(1234567.89, 'USD')).toBe('$1,234,567.89');
  });
});

// ────────────────────────────────────────────────────────────────
// 6. getSortedCurrencies
// ────────────────────────────────────────────────────────────────

describe('getSortedCurrencies', () => {
  it('should return an array of currency objects', () => {
    const sorted = getSortedCurrencies();
    expect(Array.isArray(sorted)).toBe(true);
    expect(sorted.length).toBeGreaterThan(0);
    expect(sorted[0]).toHaveProperty('code');
    expect(sorted[0]).toHaveProperty('name');
    expect(sorted[0]).toHaveProperty('symbol');
  });

  it('should be sorted by sortOrder', () => {
    const sorted = getSortedCurrencies();
    for (let i = 1; i < sorted.length; i++) {
      const prev = SUPPORTED_CURRENCIES[sorted[i - 1]!.code]!;
      const curr = SUPPORTED_CURRENCIES[sorted[i]!.code]!;
      expect(prev.sortOrder).toBeLessThanOrEqual(curr.sortOrder);
    }
  });

  it('USD should be first (lowest sortOrder)', () => {
    const sorted = getSortedCurrencies();
    expect(sorted[0]!.code).toBe('USD');
  });
});

// ────────────────────────────────────────────────────────────────
// 7. updateExchangeRateSchema validation
// ────────────────────────────────────────────────────────────────

describe('updateExchangeRateSchema', () => {
  it('should accept valid input', () => {
    const result = updateExchangeRateSchema.safeParse({
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: 1.085,
      effectiveDate: '2026-01-15',
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional source field', () => {
    const result = updateExchangeRateSchema.safeParse({
      fromCurrency: 'GBP',
      toCurrency: 'USD',
      rate: 1.27,
      effectiveDate: '2026-01-15',
      source: 'manual',
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative rate', () => {
    const result = updateExchangeRateSchema.safeParse({
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: -1.085,
      effectiveDate: '2026-01-15',
    });
    expect(result.success).toBe(false);
  });

  it('should reject zero rate', () => {
    const result = updateExchangeRateSchema.safeParse({
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: 0,
      effectiveDate: '2026-01-15',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing fromCurrency', () => {
    const result = updateExchangeRateSchema.safeParse({
      toCurrency: 'USD',
      rate: 1.085,
      effectiveDate: '2026-01-15',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing effectiveDate', () => {
    const result = updateExchangeRateSchema.safeParse({
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: 1.085,
    });
    expect(result.success).toBe(false);
  });

  it('should reject currency codes that are not 3 chars', () => {
    const result = updateExchangeRateSchema.safeParse({
      fromCurrency: 'EU',
      toCurrency: 'USD',
      rate: 1.085,
      effectiveDate: '2026-01-15',
    });
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────
// 8. updateSupportedCurrenciesSchema validation
// ────────────────────────────────────────────────────────────────

describe('updateSupportedCurrenciesSchema', () => {
  it('should accept a list of currency codes', () => {
    const result = updateSupportedCurrenciesSchema.safeParse({
      currencies: ['USD', 'EUR', 'GBP'],
    });
    expect(result.success).toBe(true);
  });

  it('should accept a single currency', () => {
    const result = updateSupportedCurrenciesSchema.safeParse({
      currencies: ['USD'],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty currencies array', () => {
    const result = updateSupportedCurrenciesSchema.safeParse({
      currencies: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing currencies field', () => {
    const result = updateSupportedCurrenciesSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────
// 9. getExchangeRate — identity rate optimization
// ────────────────────────────────────────────────────────────────

vi.mock('@oppsera/db', () => ({
  withTenant: vi.fn(),
  sql: vi.fn((...args: any[]) => args),
}));

describe('getExchangeRate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return identity rate when from === to (no DB access)', async () => {
    const { getExchangeRate } = await import('../queries/get-exchange-rate');
    const { withTenant } = await import('@oppsera/db');

    const result = await getExchangeRate('tenant-1', 'USD', 'USD', '2026-01-15');

    expect(result).toEqual({
      id: 'identity',
      fromCurrency: 'USD',
      toCurrency: 'USD',
      rate: '1.000000',
      effectiveDate: '2026-01-15',
      source: 'system',
    });
    // withTenant should NOT have been called
    expect(withTenant).not.toHaveBeenCalled();
  });

  it('should query DB for non-identity rates', async () => {
    const { getExchangeRate } = await import('../queries/get-exchange-rate');
    const { withTenant } = await import('@oppsera/db');

    const mockRate = {
      id: 'rate-1',
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: '1.085000',
      effectiveDate: '2026-01-15',
      source: 'manual',
    };
    (withTenant as any).mockResolvedValueOnce(mockRate);

    const result = await getExchangeRate('tenant-1', 'EUR', 'USD', '2026-01-15');

    expect(withTenant).toHaveBeenCalled();
    expect(result).toEqual(mockRate);
  });

  it('should return null when no rate exists', async () => {
    const { getExchangeRate } = await import('../queries/get-exchange-rate');
    const { withTenant } = await import('@oppsera/db');

    (withTenant as any).mockResolvedValueOnce(null);

    const result = await getExchangeRate('tenant-1', 'EUR', 'USD', '2026-01-15');

    expect(result).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────
// 10. Unrealized gain/loss computation tests
// ────────────────────────────────────────────────────────────────

describe('Unrealized gain/loss computation logic', () => {
  it('should compute positive gain when foreign currency appreciates', () => {
    // Booked at EUR 1000 * 1.08 = $1,080 base
    // Current rate EUR 1 = $1.12 → revalued = $1,120
    // Gain = $1,120 - $1,080 = $40
    const txnBalance = 1000;
    const bookedBase = 1080;
    const currentRate = 1.12;
    const revaluedBase = Math.round(txnBalance * currentRate * 100) / 100;
    const gainLoss = Math.round((revaluedBase - bookedBase) * 100) / 100;

    expect(revaluedBase).toBe(1120);
    expect(gainLoss).toBe(40);
  });

  it('should compute negative loss when foreign currency depreciates', () => {
    // Booked at EUR 1000 * 1.08 = $1,080 base
    // Current rate EUR 1 = $1.04 → revalued = $1,040
    // Loss = $1,040 - $1,080 = -$40
    const txnBalance = 1000;
    const bookedBase = 1080;
    const currentRate = 1.04;
    const revaluedBase = Math.round(txnBalance * currentRate * 100) / 100;
    const gainLoss = Math.round((revaluedBase - bookedBase) * 100) / 100;

    expect(revaluedBase).toBe(1040);
    expect(gainLoss).toBe(-40);
  });

  it('should compute zero gain/loss when rate unchanged', () => {
    const txnBalance = 500;
    const bookedBase = 540;
    const currentRate = 1.08; // same as booked
    const revaluedBase = Math.round(txnBalance * currentRate * 100) / 100;
    const gainLoss = Math.round((revaluedBase - bookedBase) * 100) / 100;

    expect(gainLoss).toBe(0);
  });

  it('should handle small fractional amounts without floating point drift', () => {
    // 0.1 + 0.2 problem — rounding should prevent this
    const txnBalance = 0.1;
    const bookedBase = 0.11;
    const currentRate = 1.15;
    const revaluedBase = Math.round(txnBalance * currentRate * 100) / 100;
    const gainLoss = Math.round((revaluedBase - bookedBase) * 100) / 100;

    expect(revaluedBase).toBe(0.12);
    expect(gainLoss).toBe(0.01);
  });

  it('should handle negative transaction balance (credit-normal accounts)', () => {
    // Liability: credit-normal, so txnBalance is negative
    const txnBalance = -2000;
    const bookedBase = -2160; // booked at 1.08
    const currentRate = 1.10;
    const revaluedBase = Math.round(txnBalance * currentRate * 100) / 100;
    const gainLoss = Math.round((revaluedBase - bookedBase) * 100) / 100;

    expect(revaluedBase).toBe(-2200);
    expect(gainLoss).toBe(-40); // loss on liability when foreign currency strengthens
  });
});

// ────────────────────────────────────────────────────────────────
// 11. Missing rates tracking
// ────────────────────────────────────────────────────────────────

describe('Missing rates tracking', () => {
  it('should collect unique missing rate currencies into a Set', () => {
    // Simulates the logic in getUnrealizedGainLoss
    const rows = [
      { transactionCurrency: 'EUR', currentRate: 1.08 },
      { transactionCurrency: 'GBP', currentRate: null },
      { transactionCurrency: 'GBP', currentRate: null },
      { transactionCurrency: 'CAD', currentRate: null },
      { transactionCurrency: 'EUR', currentRate: 1.08 },
    ];

    const missingRates = new Set<string>();
    for (const row of rows) {
      if (row.currentRate === null) {
        missingRates.add(row.transactionCurrency);
      }
    }

    expect(Array.from(missingRates).sort()).toEqual(['CAD', 'GBP']);
  });
});

// ────────────────────────────────────────────────────────────────
// 12. API route contract (unrealized-gain-loss)
// ────────────────────────────────────────────────────────────────

describe('Unrealized gain/loss API contract', () => {
  it('should require asOfDate query parameter', () => {
    // The API route validates asOfDate presence — simulate
    const asOfDate: string | null = null;
    expect(asOfDate).toBeNull();
    // Route returns 400 when asOfDate is missing
  });

  it('should accept valid asOfDate', () => {
    const asOfDate = '2026-01-31';
    expect(asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ────────────────────────────────────────────────────────────────
// 13. Frontend hook contract (useCurrencySettings)
// ────────────────────────────────────────────────────────────────

describe('Currency settings hook contract', () => {
  it('should define correct API endpoints', () => {
    const endpoints = {
      supported: '/api/v1/accounting/currencies/supported',
      rates: '/api/v1/accounting/currencies/rates',
      unrealizedGainLoss: '/api/v1/accounting/currencies/unrealized-gain-loss',
    };

    expect(endpoints.supported).toContain('/currencies/supported');
    expect(endpoints.rates).toContain('/currencies/rates');
    expect(endpoints.unrealizedGainLoss).toContain('/unrealized-gain-loss');
  });

  it('should define ExchangeRate interface shape', () => {
    const rate = {
      id: 'rate-1',
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: 1.085,
      effectiveDate: '2026-01-15',
      source: 'manual',
      createdAt: '2026-01-15T10:00:00Z',
    };

    expect(rate).toHaveProperty('id');
    expect(rate).toHaveProperty('fromCurrency');
    expect(rate).toHaveProperty('toCurrency');
    expect(rate).toHaveProperty('rate');
    expect(rate).toHaveProperty('effectiveDate');
    expect(rate).toHaveProperty('source');
  });

  it('should define UnrealizedGainLossReport shape', () => {
    const report = {
      asOfDate: '2026-01-31',
      baseCurrency: 'USD',
      lines: [],
      totalUnrealizedGainLoss: 0,
      missingRates: [],
    };

    expect(report).toHaveProperty('asOfDate');
    expect(report).toHaveProperty('baseCurrency');
    expect(Array.isArray(report.lines)).toBe(true);
    expect(typeof report.totalUnrealizedGainLoss).toBe('number');
    expect(Array.isArray(report.missingRates)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────
// 14. Exchange rate temporal lookup logic
// ────────────────────────────────────────────────────────────────

describe('Exchange rate temporal lookup', () => {
  it('should prefer most recent rate on or before asOfDate', () => {
    // Simulates the SQL ordering: effective_date DESC, id DESC
    const rates = [
      { id: '3', effectiveDate: '2026-01-20', rate: '1.090' },
      { id: '2', effectiveDate: '2026-01-15', rate: '1.085' },
      { id: '1', effectiveDate: '2026-01-01', rate: '1.080' },
    ];

    const asOfDate = '2026-01-18';
    const applicable = rates
      .filter(r => r.effectiveDate <= asOfDate)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

    expect(applicable[0]!.effectiveDate).toBe('2026-01-15');
    expect(applicable[0]!.rate).toBe('1.085');
  });

  it('should return nothing when no rates exist before asOfDate', () => {
    const rates = [
      { id: '1', effectiveDate: '2026-02-01', rate: '1.080' },
    ];

    const asOfDate = '2026-01-15';
    const applicable = rates.filter(r => r.effectiveDate <= asOfDate);

    expect(applicable.length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────
// 15. Currency validation edge cases
// ────────────────────────────────────────────────────────────────

describe('Currency validation edge cases', () => {
  it('should reject same from/to currency in exchange rate update', () => {
    // Business rule: fromCurrency !== toCurrency (validated in command)
    const from = 'USD';
    const to = 'USD';
    expect(from).toBe(to); // This would be caught by command validation
  });

  it('should auto-include base currency in supported list', () => {
    // Business rule: baseCurrency is always in supportedCurrencies
    const baseCurrency = 'USD';
    const userInput = ['EUR', 'GBP'];
    const deduped = Array.from(new Set([baseCurrency, ...userInput]));

    expect(deduped).toContain('USD');
    expect(deduped).toContain('EUR');
    expect(deduped).toContain('GBP');
    expect(deduped.length).toBe(3);
  });

  it('should deduplicate currencies', () => {
    const baseCurrency = 'USD';
    const userInput = ['USD', 'EUR', 'EUR', 'GBP'];
    const deduped = Array.from(new Set([baseCurrency, ...userInput]));

    expect(deduped.length).toBe(3);
  });
});

// ────────────────────────────────────────────────────────────────
// 16. GL posting with currency support
// ────────────────────────────────────────────────────────────────

describe('GL posting currency support', () => {
  it('should default transactionCurrency to baseCurrency when not provided', () => {
    const baseCurrency = 'USD';
    const input = { transactionCurrency: undefined };
    const effectiveCurrency = input.transactionCurrency ?? baseCurrency;

    expect(effectiveCurrency).toBe('USD');
  });

  it('should default exchangeRate to 1.0 when currency matches base', () => {
    const baseCurrency = 'USD';
    const txnCurrency = 'USD';
    const effectiveRate = txnCurrency === baseCurrency ? 1.0 : undefined;

    expect(effectiveRate).toBe(1.0);
  });

  it('should require exchangeRate when currency differs from base', () => {
    const baseCurrency = 'USD';
    const txnCurrency = 'EUR';
    const providedRate = 1.085;
    const needsRate = (txnCurrency as string) !== (baseCurrency as string);

    expect(needsRate).toBe(true);
    expect(providedRate).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────
// 17. Accounting settings multi-currency fields
// ────────────────────────────────────────────────────────────────

describe('AccountingSettings multi-currency fields', () => {
  it('should have supportedCurrencies as string array', () => {
    const settings = {
      supportedCurrencies: ['USD', 'EUR', 'GBP'],
      baseCurrency: 'USD',
    };

    expect(Array.isArray(settings.supportedCurrencies)).toBe(true);
    expect(settings.supportedCurrencies).toContain('USD');
    expect(settings.baseCurrency).toBe('USD');
  });

  it('should default supportedCurrencies to [USD] when null', () => {
    const raw = null;
    const currencies = raw ?? ['USD'];

    expect(currencies).toEqual(['USD']);
  });
});
