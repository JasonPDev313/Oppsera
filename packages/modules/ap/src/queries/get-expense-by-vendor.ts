import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GetExpenseByVendorInput {
  tenantId: string;
  startDate: string;
  endDate: string;
  vendorId?: string;
}

export interface VendorExpenseRow {
  vendorId: string;
  vendorName: string;
  totalExpense: number;
  accounts: Array<{
    accountId: string;
    accountNumber: string;
    accountName: string;
    amount: number;
  }>;
}

export async function getExpenseByVendor(input: GetExpenseByVendorInput): Promise<VendorExpenseRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    const vendorCondition = input.vendorId ? sql`AND b.vendor_id = ${input.vendorId}` : sql``;

    const rows = await tx.execute(sql`
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        ga.id AS account_id,
        ga.account_number,
        ga.name AS account_name,
        SUM(bl.amount::numeric) AS total_amount
      FROM ap_bill_lines bl
      INNER JOIN ap_bills b ON b.id = bl.bill_id
      INNER JOIN vendors v ON v.id = b.vendor_id
      INNER JOIN gl_accounts ga ON ga.id = bl.account_id
      WHERE b.tenant_id = ${input.tenantId}
        AND b.status IN ('posted', 'partial', 'paid')
        AND b.bill_date BETWEEN ${input.startDate} AND ${input.endDate}
        ${vendorCondition}
      GROUP BY v.id, v.name, ga.id, ga.account_number, ga.name
      ORDER BY v.name, ga.account_number
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const vendorMap = new Map<string, VendorExpenseRow>();
    for (const row of allRows) {
      const vendorId = String(row.vendor_id);
      if (!vendorMap.has(vendorId)) {
        vendorMap.set(vendorId, {
          vendorId,
          vendorName: String(row.vendor_name),
          totalExpense: 0,
          accounts: [],
        });
      }
      const vendor = vendorMap.get(vendorId)!;
      const amount = Number(row.total_amount);
      vendor.totalExpense += amount;
      vendor.accounts.push({
        accountId: String(row.account_id),
        accountNumber: String(row.account_number),
        accountName: String(row.account_name),
        amount,
      });
    }

    return Array.from(vendorMap.values());
  });
}
