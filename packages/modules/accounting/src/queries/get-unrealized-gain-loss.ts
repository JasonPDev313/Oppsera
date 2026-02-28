import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface UnrealizedGainLossLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  transactionCurrency: string;
  /** Balance in transaction currency (not converted) */
  transactionCurrencyBalance: number;
  /** Balance at the originally booked exchange rate (in base currency) */
  bookedBaseBalance: number;
  /** Current exchange rate as of the asOfDate */
  currentRate: number | null;
  /** Balance revalued at current rate (in base currency) */
  revaluedBaseBalance: number | null;
  /** Unrealized gain (positive) or loss (negative) in base currency */
  unrealizedGainLoss: number | null;
}

export interface UnrealizedGainLossReport {
  asOfDate: string;
  baseCurrency: string;
  lines: UnrealizedGainLossLine[];
  totalUnrealizedGainLoss: number;
  /** Currencies that have no current exchange rate — revaluation incomplete */
  missingRates: string[];
}

interface GetUnrealizedGainLossInput {
  tenantId: string;
  asOfDate: string;
}

/**
 * Compute unrealized FX gain/loss for all GL accounts with foreign-currency entries.
 *
 * For each (account, transactionCurrency) pair where transactionCurrency != baseCurrency:
 * 1. Compute balance in transaction currency (raw, unconverted)
 * 2. Compute balance at the booked exchange rate (base currency)
 * 3. Look up the current exchange rate as of asOfDate
 * 4. Revalue: transactionCurrencyBalance * currentRate
 * 5. Unrealized gain/loss = revalued - booked
 *
 * Positive = gain (foreign currency appreciated), Negative = loss (foreign currency depreciated).
 */
export async function getUnrealizedGainLoss(
  input: GetUnrealizedGainLossInput,
): Promise<UnrealizedGainLossReport> {
  return withTenant(input.tenantId, async (tx) => {
    // Get base currency from settings
    const settingsRows = await tx.execute(sql`
      SELECT base_currency FROM accounting_settings
      WHERE tenant_id = ${input.tenantId} LIMIT 1
    `);
    const settingsArr = Array.from(settingsRows as Iterable<Record<string, unknown>>);
    const baseCurrency = settingsArr.length > 0 ? String(settingsArr[0]!.base_currency) : 'USD';

    // Query foreign-currency balances grouped by (account, transactionCurrency),
    // joined to current exchange rates for revaluation.
    //
    // Uses INNER JOINs (not LEFT JOINs) so the (jl.id IS NULL OR je.id IS NOT NULL)
    // guard is not needed — non-posted entries are automatically excluded.
    //
    // The current_rates CTE uses DISTINCT ON to get the most recent rate per currency
    // pair with effective_date <= asOfDate.
    const rows = await tx.execute(sql`
      WITH current_rates AS (
        SELECT DISTINCT ON (from_currency, to_currency)
          from_currency,
          to_currency,
          rate
        FROM currency_exchange_rates
        WHERE tenant_id = ${input.tenantId}
          AND effective_date <= ${input.asOfDate}
        ORDER BY from_currency, to_currency, effective_date DESC
      )
      SELECT
        a.id AS account_id,
        a.account_number,
        a.name AS account_name,
        a.account_type,
        a.normal_balance,
        je.transaction_currency,
        CASE WHEN a.normal_balance = 'debit'
          THEN COALESCE(SUM(jl.debit_amount), 0) - COALESCE(SUM(jl.credit_amount), 0)
          ELSE COALESCE(SUM(jl.credit_amount), 0) - COALESCE(SUM(jl.debit_amount), 0)
        END AS transaction_currency_balance,
        CASE WHEN a.normal_balance = 'debit'
          THEN COALESCE(SUM(jl.debit_amount * je.exchange_rate), 0) - COALESCE(SUM(jl.credit_amount * je.exchange_rate), 0)
          ELSE COALESCE(SUM(jl.credit_amount * je.exchange_rate), 0) - COALESCE(SUM(jl.debit_amount * je.exchange_rate), 0)
        END AS booked_base_balance,
        cr.rate AS current_rate
      FROM gl_accounts a
      JOIN gl_journal_lines jl ON jl.account_id = a.id
      JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${input.tenantId}
        AND je.business_date <= ${input.asOfDate}
      LEFT JOIN current_rates cr
        ON cr.from_currency = je.transaction_currency
        AND cr.to_currency = ${baseCurrency}
      WHERE a.tenant_id = ${input.tenantId}
        AND a.is_active = true
        AND je.transaction_currency != ${baseCurrency}
      GROUP BY a.id, a.account_number, a.name, a.account_type, a.normal_balance,
               je.transaction_currency, cr.rate
      HAVING COALESCE(SUM(jl.debit_amount), 0) != 0
          OR COALESCE(SUM(jl.credit_amount), 0) != 0
      ORDER BY a.account_number, je.transaction_currency
    `);

    const accountRows = Array.from(rows as Iterable<Record<string, unknown>>);

    const lines: UnrealizedGainLossLine[] = [];
    const missingRatesSet = new Set<string>();
    let totalUnrealizedGainLoss = 0;

    for (const row of accountRows) {
      const txnBalance = Number(row.transaction_currency_balance);
      const bookedBase = Number(row.booked_base_balance);
      const currentRate = row.current_rate != null ? Number(row.current_rate) : null;
      const txnCurrency = String(row.transaction_currency);

      let revaluedBase: number | null = null;
      let gainLoss: number | null = null;

      if (currentRate != null) {
        revaluedBase = Math.round(txnBalance * currentRate * 100) / 100;
        gainLoss = Math.round((revaluedBase - bookedBase) * 100) / 100;
        totalUnrealizedGainLoss += gainLoss;
      } else {
        missingRatesSet.add(txnCurrency);
      }

      lines.push({
        accountId: String(row.account_id),
        accountNumber: String(row.account_number),
        accountName: String(row.account_name),
        accountType: String(row.account_type),
        normalBalance: String(row.normal_balance),
        transactionCurrency: txnCurrency,
        transactionCurrencyBalance: Math.round(txnBalance * 100) / 100,
        bookedBaseBalance: Math.round(bookedBase * 100) / 100,
        currentRate,
        revaluedBaseBalance: revaluedBase,
        unrealizedGainLoss: gainLoss,
      });
    }

    totalUnrealizedGainLoss = Math.round(totalUnrealizedGainLoss * 100) / 100;

    return {
      asOfDate: input.asOfDate,
      baseCurrency,
      lines,
      totalUnrealizedGainLoss,
      missingRates: Array.from(missingRatesSet),
    };
  });
}
