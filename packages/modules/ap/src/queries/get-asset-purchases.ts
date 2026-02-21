import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface GetAssetPurchasesInput {
  tenantId: string;
  startDate: string;
  endDate: string;
}

export interface AssetPurchaseItem {
  billId: string;
  billNumber: string;
  vendorName: string;
  description: string | null;
  amount: number;
  billDate: string;
}

export interface AssetPurchaseRow {
  accountId: string;
  accountNumber: string;
  accountName: string;
  totalAmount: number;
  lineCount: number;
  items: AssetPurchaseItem[];
}

export async function getAssetPurchases(input: GetAssetPurchasesInput): Promise<AssetPurchaseRow[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        ga.id AS account_id,
        ga.account_number,
        ga.name AS account_name,
        b.id AS bill_id,
        b.bill_number,
        v.name AS vendor_name,
        bl.description,
        bl.amount,
        b.bill_date
      FROM ap_bill_lines bl
      INNER JOIN ap_bills b ON b.id = bl.bill_id
      INNER JOIN vendors v ON v.id = b.vendor_id
      INNER JOIN gl_accounts ga ON ga.id = bl.account_id
      WHERE b.tenant_id = ${input.tenantId}
        AND bl.line_type = 'asset'
        AND b.status IN ('posted', 'partial', 'paid')
        AND b.bill_date BETWEEN ${input.startDate} AND ${input.endDate}
      ORDER BY ga.account_number, b.bill_date
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const accountMap = new Map<string, AssetPurchaseRow>();
    for (const row of allRows) {
      const accountId = String(row.account_id);
      if (!accountMap.has(accountId)) {
        accountMap.set(accountId, {
          accountId,
          accountNumber: String(row.account_number),
          accountName: String(row.account_name),
          totalAmount: 0,
          lineCount: 0,
          items: [],
        });
      }
      const account = accountMap.get(accountId)!;
      const amount = Number(row.amount);
      account.totalAmount += amount;
      account.lineCount++;
      account.items.push({
        billId: String(row.bill_id),
        billNumber: String(row.bill_number),
        vendorName: String(row.vendor_name),
        description: row.description ? String(row.description) : null,
        amount,
        billDate: String(row.bill_date),
      });
    }

    return Array.from(accountMap.values());
  });
}
