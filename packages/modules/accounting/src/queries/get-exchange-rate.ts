import { eq, and, lte, desc } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { currencyExchangeRates } from '@oppsera/db';

export interface ExchangeRateResult {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveDate: string;
  source: string;
  createdAt: Date;
}

/**
 * Get the effective exchange rate for a currency pair as of a given date.
 * Returns the most recent rate with effective_date <= asOfDate.
 * Returns null if no rate exists.
 */
export async function getExchangeRate(
  tenantId: string,
  fromCurrency: string,
  toCurrency: string,
  asOfDate: string,
): Promise<ExchangeRateResult | null> {
  // Identity rate — same currency always returns 1.0
  if (fromCurrency === toCurrency) {
    return {
      id: 'identity',
      fromCurrency,
      toCurrency,
      rate: '1.000000',
      effectiveDate: asOfDate,
      source: 'system',
      createdAt: new Date(),
    };
  }

  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        id: currencyExchangeRates.id,
        fromCurrency: currencyExchangeRates.fromCurrency,
        toCurrency: currencyExchangeRates.toCurrency,
        rate: currencyExchangeRates.rate,
        effectiveDate: currencyExchangeRates.effectiveDate,
        source: currencyExchangeRates.source,
        createdAt: currencyExchangeRates.createdAt,
      })
      .from(currencyExchangeRates)
      .where(
        and(
          eq(currencyExchangeRates.tenantId, tenantId),
          eq(currencyExchangeRates.fromCurrency, fromCurrency),
          eq(currencyExchangeRates.toCurrency, toCurrency),
          lte(currencyExchangeRates.effectiveDate, asOfDate),
        ),
      )
      .orderBy(desc(currencyExchangeRates.effectiveDate))
      .limit(1);

    if (!row) return null;

    return {
      id: row.id,
      fromCurrency: row.fromCurrency,
      toCurrency: row.toCurrency,
      rate: row.rate!,
      effectiveDate: row.effectiveDate,
      source: row.source,
      createdAt: row.createdAt,
    };
  });
}
