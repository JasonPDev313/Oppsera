import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { PnlAccountLine, PnlSection } from './get-profit-and-loss';

// ── Types ──────────────────────────────────────────────────

export interface LocationPnl {
  locationId: string;
  locationName: string;
  sections: PnlSection[];
  grossRevenue: number;
  contraRevenue: number;
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

export interface ConsolidatedPL {
  period: { from: string; to: string };
  locations: LocationPnl[];
  consolidated: {
    sections: PnlSection[];
    grossRevenue: number;
    contraRevenue: number;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
  locationCount: number;
}

// ── Input ──────────────────────────────────────────────────

interface GetConsolidatedPLInput {
  tenantId: string;
  from: string; // YYYY-MM-DD
  to: string;
  locationIds?: string[]; // if empty, all locations
}

// ── Query ──────────────────────────────────────────────────

export async function getConsolidatedPL(input: GetConsolidatedPLInput): Promise<ConsolidatedPL> {
  return withTenant(input.tenantId, async (tx) => {
    // 1) Fetch all locations for the tenant (or filter to requested ones)
    const locationFilter = input.locationIds?.length
      ? sql`AND l.id IN ${sql`(${sql.join(input.locationIds.map(id => sql`${id}`), sql`, `)})`}`
      : sql``;

    const locationRows = await tx.execute(sql`
      SELECT l.id, l.name
      FROM locations l
      WHERE l.tenant_id = ${input.tenantId}
        AND l.is_active = true
        ${locationFilter}
      ORDER BY l.name
    `);

    const allLocations = Array.from(locationRows as Iterable<Record<string, unknown>>);

    // 2) Run P&L query per location using gl_journal_lines.location_id dimension
    //    This uses the same GL query guard as getProfitAndLoss.
    async function computePnlForLocation(locationId: string | null) {
      const locFilter = locationId
        ? sql`AND jl.location_id = ${locationId}`
        : sql``;

      const rows = await tx.execute(sql`
        SELECT
          a.id AS account_id,
          a.account_number,
          a.name AS account_name,
          a.account_type,
          a.is_contra_account,
          COALESCE(c.name, a.account_type) AS classification_name,
          CASE WHEN a.account_type = 'revenue'
            THEN COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)) - SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0)
            ELSE COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)) - SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0)
          END AS amount
        FROM gl_accounts a
        LEFT JOIN gl_classifications c ON c.id = a.classification_id
        LEFT JOIN gl_journal_lines jl ON jl.account_id = a.id
          ${locFilter}
        LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
          AND je.status = 'posted'
          AND je.tenant_id = ${input.tenantId}
          AND je.business_date >= ${input.from}
          AND je.business_date <= ${input.to}
        WHERE a.tenant_id = ${input.tenantId}
          AND a.is_active = true
          AND a.account_type IN ('revenue', 'expense')
          AND (jl.id IS NULL OR je.id IS NOT NULL)
        GROUP BY a.id, a.account_number, a.name, a.account_type, a.is_contra_account, c.name
        HAVING COALESCE(SUM(jl.debit_amount * COALESCE(je.exchange_rate, 1)), 0) != 0
            OR COALESCE(SUM(jl.credit_amount * COALESCE(je.exchange_rate, 1)), 0) != 0
        ORDER BY a.account_number
      `);

      const accountRows = Array.from(rows as Iterable<Record<string, unknown>>);

      const revenueSections = new Map<string, PnlAccountLine[]>();
      const contraRevenueSections = new Map<string, PnlAccountLine[]>();
      const expenseSections = new Map<string, PnlAccountLine[]>();
      let grossRevenue = 0;
      let contraRevenue = 0;
      let totalExpenses = 0;

      for (const row of accountRows) {
        const isContra = Boolean(row.is_contra_account);
        const rawAmount = Number(row.amount);
        const line: PnlAccountLine = {
          accountId: String(row.account_id),
          accountNumber: String(row.account_number),
          accountName: String(row.account_name),
          classificationName: row.classification_name ? String(row.classification_name) : null,
          isContraAccount: isContra,
          amount: rawAmount,
        };
        const classLabel = line.classificationName ?? String(row.account_type);

        if (String(row.account_type) === 'revenue') {
          if (isContra) {
            contraRevenue += rawAmount;
            const label = `Less: ${classLabel}`;
            const arr = contraRevenueSections.get(label) ?? [];
            arr.push(line);
            contraRevenueSections.set(label, arr);
          } else {
            grossRevenue += rawAmount;
            const arr = revenueSections.get(classLabel) ?? [];
            arr.push(line);
            revenueSections.set(classLabel, arr);
          }
        } else {
          totalExpenses += rawAmount;
          const arr = expenseSections.get(classLabel) ?? [];
          arr.push(line);
          expenseSections.set(classLabel, arr);
        }
      }

      grossRevenue = Math.round(grossRevenue * 100) / 100;
      contraRevenue = Math.round(contraRevenue * 100) / 100;
      totalExpenses = Math.round(totalExpenses * 100) / 100;
      const totalRevenue = Math.round((grossRevenue + contraRevenue) * 100) / 100;

      const sections: PnlSection[] = [];
      for (const [label, accounts] of revenueSections) {
        sections.push({
          label,
          accounts,
          subtotal: Math.round(accounts.reduce((sum, a) => sum + a.amount, 0) * 100) / 100,
        });
      }
      for (const [label, accounts] of contraRevenueSections) {
        sections.push({
          label,
          accounts,
          subtotal: Math.round(accounts.reduce((sum, a) => sum + a.amount, 0) * 100) / 100,
        });
      }
      for (const [label, accounts] of expenseSections) {
        sections.push({
          label,
          accounts,
          subtotal: Math.round(accounts.reduce((sum, a) => sum + a.amount, 0) * 100) / 100,
        });
      }

      return {
        sections,
        grossRevenue,
        contraRevenue,
        totalRevenue,
        totalExpenses,
        netIncome: Math.round((totalRevenue - totalExpenses) * 100) / 100,
      };
    }

    // 3) Compute P&L per location
    const locationPnls: LocationPnl[] = [];
    for (const loc of allLocations) {
      const pnl = await computePnlForLocation(String(loc.id));
      locationPnls.push({
        locationId: String(loc.id),
        locationName: String(loc.name),
        ...pnl,
      });
    }

    // 4) Compute consolidated totals (no location filter = all GL entries)
    const consolidated = await computePnlForLocation(null);

    return {
      period: { from: input.from, to: input.to },
      locations: locationPnls,
      consolidated,
      locationCount: locationPnls.length,
    };
  });
}
