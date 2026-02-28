import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface CashFlowForecastItem {
  date: string;
  type: 'ap' | 'ar';
  entityId: string;
  entityName: string;
  referenceNumber: string;
  amount: number;
}

export interface CashFlowForecastDay {
  date: string;
  inflows: number;
  outflows: number;
  net: number;
  runningBalance: number;
}

export interface CashFlowForecastReport {
  asOfDate: string;
  forecastDays: number;
  startingCash: number;
  projected30: number;
  projected60: number;
  projected90: number;
  dailyForecast: CashFlowForecastDay[];
  upcomingItems: CashFlowForecastItem[];
}

interface GetCashFlowForecastInput {
  tenantId: string;
  days?: number; // default 90
  locationId?: string;
}

export async function getCashFlowForecast(
  input: GetCashFlowForecastInput,
): Promise<CashFlowForecastReport> {
  const days = input.days ?? 90;

  return withTenant(input.tenantId, async (tx) => {
    // 1. Get current cash balance from GL (bank + undeposited funds accounts)
    // Uses debit-normal direction since these are asset accounts
    const cashRows = await tx.execute(sql`
      SELECT
        COALESCE(
          SUM(
            jl.debit_amount * COALESCE(je.exchange_rate, 1) -
            jl.credit_amount * COALESCE(je.exchange_rate, 1)
          ),
          0
        ) AS cash_balance
      FROM gl_accounts a
      LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${input.tenantId}
      WHERE a.tenant_id = ${input.tenantId}
        AND a.is_active = true
        AND a.account_type = 'asset'
        AND a.control_account_type IN ('bank', 'undeposited_funds')
        AND (jl.id IS NULL OR je.id IS NOT NULL)
    `);

    const cashBalanceRows = Array.from(cashRows as Iterable<Record<string, unknown>>);
    const startingCash = Number(cashBalanceRows[0]?.cash_balance ?? 0);

    const today = new Date().toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

    // 2. Get open AP bills (outflows) grouped by due date
    const locationFilterAP = input.locationId
      ? sql`AND b.location_id = ${input.locationId}`
      : sql``;

    const apRows = await tx.execute(sql`
      SELECT
        b.due_date,
        b.id AS entity_id,
        v.name AS entity_name,
        b.bill_number AS reference_number,
        b.balance_due AS amount
      FROM ap_bills b
      LEFT JOIN vendors v ON v.id = b.vendor_id
      WHERE b.tenant_id = ${input.tenantId}
        AND b.status IN ('posted', 'partial')
        AND CAST(b.balance_due AS numeric) > 0
        AND b.due_date >= ${today}
        AND b.due_date <= ${endDate}
        ${locationFilterAP}
      ORDER BY b.due_date
    `);

    // 3. Get open AR invoices (inflows) grouped by due date
    const locationFilterAR = input.locationId
      ? sql`AND i.location_id = ${input.locationId}`
      : sql``;

    const arRows = await tx.execute(sql`
      SELECT
        i.due_date::text AS due_date,
        i.id AS entity_id,
        c.display_name AS entity_name,
        i.invoice_number AS reference_number,
        i.balance_due AS amount
      FROM ar_invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.tenant_id = ${input.tenantId}
        AND i.status IN ('posted', 'partial')
        AND CAST(i.balance_due AS numeric) > 0
        AND i.due_date >= ${today}::date
        AND i.due_date <= ${endDate}::date
        ${locationFilterAR}
      ORDER BY i.due_date
    `);

    const apItems = Array.from(apRows as Iterable<Record<string, unknown>>);
    const arItems = Array.from(arRows as Iterable<Record<string, unknown>>);

    // Build upcoming items list
    const upcomingItems: CashFlowForecastItem[] = [];

    for (const row of apItems) {
      upcomingItems.push({
        date: String(row.due_date),
        type: 'ap',
        entityId: String(row.entity_id),
        entityName: String(row.entity_name ?? 'Unknown Vendor'),
        referenceNumber: String(row.reference_number),
        amount: Number(row.amount),
      });
    }

    for (const row of arItems) {
      upcomingItems.push({
        date: String(row.due_date),
        type: 'ar',
        entityId: String(row.entity_id),
        entityName: String(row.entity_name ?? 'Unknown Customer'),
        referenceNumber: String(row.reference_number),
        amount: Number(row.amount),
      });
    }

    // Sort by date
    upcomingItems.sort((a, b) => a.date.localeCompare(b.date));

    // Build daily forecast with running balance
    const dailyMap = new Map<string, { inflows: number; outflows: number }>();

    for (const item of upcomingItems) {
      const entry = dailyMap.get(item.date) ?? { inflows: 0, outflows: 0 };
      if (item.type === 'ar') {
        entry.inflows += item.amount;
      } else {
        entry.outflows += item.amount;
      }
      dailyMap.set(item.date, entry);
    }

    const dailyForecast: CashFlowForecastDay[] = [];
    let runningBalance = startingCash;

    // Generate entries for every day that has activity
    const sortedDates = Array.from(dailyMap.keys()).sort();
    for (const date of sortedDates) {
      const day = dailyMap.get(date)!;
      const net = Math.round((day.inflows - day.outflows) * 100) / 100;
      runningBalance = Math.round((runningBalance + net) * 100) / 100;

      dailyForecast.push({
        date,
        inflows: Math.round(day.inflows * 100) / 100,
        outflows: Math.round(day.outflows * 100) / 100,
        net,
        runningBalance,
      });
    }

    // Calculate projected balances at 30/60/90 day marks
    const d30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const d60 = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    const d90 = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

    function projectedAt(targetDate: string): number {
      let balance = startingCash;
      for (const day of dailyForecast) {
        if (day.date > targetDate) break;
        balance = day.runningBalance;
      }
      return balance;
    }

    return {
      asOfDate: today,
      forecastDays: days,
      startingCash: Math.round(startingCash * 100) / 100,
      projected30: projectedAt(d30),
      projected60: projectedAt(d60),
      projected90: projectedAt(d90),
      dailyForecast,
      upcomingItems,
    };
  });
}
