import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface SalesTaxGroupRow {
  taxGroupId: string;
  taxGroupName: string | null;
  taxPayableAccountId: string;
  taxPayableAccountName: string;
  taxCollected: number;
  taxRemitted: number;
  netLiability: number;
}

export interface SalesTaxLiability {
  period: { from: string; to: string };
  taxGroups: SalesTaxGroupRow[];
  totalCollected: number;
  totalRemitted: number;
  totalNetLiability: number;
}

interface GetSalesTaxLiabilityInput {
  tenantId: string;
  from: string;
  to: string;
}

export async function getSalesTaxLiability(input: GetSalesTaxLiabilityInput): Promise<SalesTaxLiability> {
  return withTenant(input.tenantId, async (tx) => {
    // Get all tax group -> GL account mappings with activity
    const mappingRows = await tx.execute(sql`
      SELECT
        tgd.tax_group_id,
        tgd.tax_payable_account_id,
        a.name AS account_name,
        COALESCE(SUM(jl.credit_amount), 0) AS total_credits,
        COALESCE(SUM(jl.debit_amount), 0) AS total_debits
      FROM tax_group_gl_defaults tgd
      JOIN gl_accounts a ON a.id = tgd.tax_payable_account_id
      LEFT JOIN gl_journal_lines jl ON jl.account_id = tgd.tax_payable_account_id
      LEFT JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        AND je.status = 'posted'
        AND je.tenant_id = ${input.tenantId}
        AND je.business_date >= ${input.from}
        AND je.business_date <= ${input.to}
      WHERE tgd.tenant_id = ${input.tenantId}
      GROUP BY tgd.tax_group_id, tgd.tax_payable_account_id, a.name
      ORDER BY tgd.tax_group_id
    `);

    const mappingArr = Array.from(mappingRows as Iterable<Record<string, unknown>>);

    let totalCollected = 0;
    let totalRemitted = 0;

    const taxGroups: SalesTaxGroupRow[] = mappingArr.map((row) => {
      // Tax collected = credits to tax payable (normal credit balance account)
      // Tax remitted = debits to tax payable (paying the authority)
      const collected = Number(row.total_credits);
      const remitted = Number(row.total_debits);
      const net = Math.round((collected - remitted) * 100) / 100;

      totalCollected += collected;
      totalRemitted += remitted;

      return {
        taxGroupId: String(row.tax_group_id),
        taxGroupName: null, // Would need cross-module lookup; use ID for now
        taxPayableAccountId: String(row.tax_payable_account_id),
        taxPayableAccountName: String(row.account_name),
        taxCollected: Math.round(collected * 100) / 100,
        taxRemitted: Math.round(remitted * 100) / 100,
        netLiability: net,
      };
    });

    return {
      period: { from: input.from, to: input.to },
      taxGroups,
      totalCollected: Math.round(totalCollected * 100) / 100,
      totalRemitted: Math.round(totalRemitted * 100) / 100,
      totalNetLiability: Math.round((totalCollected - totalRemitted) * 100) / 100,
    };
  });
}
