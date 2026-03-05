import { eq, and, desc, sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { currencyExchangeRates } from '@oppsera/db';

function encodeCursor(...parts: string[]): string {
  return parts.join('|');
}

function decodeCursor(cursor: string, expectedParts: number): string[] | null {
  const parts = cursor.split('|');
  if (parts.length !== expectedParts) return null; // Legacy fallback
  return parts;
}

export interface ExchangeRateListItem {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveDate: string;
  source: string;
  createdAt: Date;
  createdBy: string | null;
}

export interface ListExchangeRatesInput {
  tenantId: string;
  fromCurrency?: string;
  toCurrency?: string;
  cursor?: string;
  limit?: number;
}

export interface ListExchangeRatesResult {
  items: ExchangeRateListItem[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * List exchange rates with optional currency pair filtering and cursor pagination.
 */
export async function listExchangeRates(
  input: ListExchangeRatesInput,
): Promise<ListExchangeRatesResult> {
  const limit = input.limit ?? 50;

  return withTenant(input.tenantId, async (tx) => {
    const conditions = [eq(currencyExchangeRates.tenantId, input.tenantId)];

    if (input.fromCurrency) {
      conditions.push(eq(currencyExchangeRates.fromCurrency, input.fromCurrency));
    }
    if (input.toCurrency) {
      conditions.push(eq(currencyExchangeRates.toCurrency, input.toCurrency));
    }

    if (input.cursor) {
      const decoded = decodeCursor(input.cursor, 2);
      if (decoded) {
        const [cursorDate, cursorId] = decoded as [string, string];
        conditions.push(
          sql`(${currencyExchangeRates.effectiveDate}, ${currencyExchangeRates.id}) < (${cursorDate}::date, ${cursorId})` as unknown as ReturnType<typeof eq>,
        );
      } else {
        // Legacy: cursor was plain id
        conditions.push(
          sql`${currencyExchangeRates.id} < ${input.cursor}` as unknown as ReturnType<typeof eq>,
        );
      }
    }

    const rows = await tx
      .select({
        id: currencyExchangeRates.id,
        fromCurrency: currencyExchangeRates.fromCurrency,
        toCurrency: currencyExchangeRates.toCurrency,
        rate: currencyExchangeRates.rate,
        effectiveDate: currencyExchangeRates.effectiveDate,
        source: currencyExchangeRates.source,
        createdAt: currencyExchangeRates.createdAt,
        createdBy: currencyExchangeRates.createdBy,
      })
      .from(currencyExchangeRates)
      .where(and(...conditions))
      .orderBy(desc(currencyExchangeRates.effectiveDate), desc(currencyExchangeRates.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1];

    return {
      items: items.map((row) => ({
        id: row.id,
        fromCurrency: row.fromCurrency,
        toCurrency: row.toCurrency,
        rate: row.rate!,
        effectiveDate: row.effectiveDate,
        source: row.source,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
      })),
      cursor: hasMore && lastItem
        ? encodeCursor(lastItem.effectiveDate, lastItem.id)
        : null,
      hasMore,
    };
  });
}
