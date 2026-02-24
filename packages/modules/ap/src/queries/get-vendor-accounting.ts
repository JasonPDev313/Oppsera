import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';

export interface GetVendorAccountingInput {
  tenantId: string;
  vendorId: string;
}

export interface VendorAccountingDetail {
  id: string;
  name: string;
  vendorNumber: string | null;
  defaultExpenseAccountId: string | null;
  defaultExpenseAccountName: string | null;
  defaultAPAccountId: string | null;
  defaultAPAccountName: string | null;
  paymentTermsId: string | null;
  paymentTermsName: string | null;
  is1099Eligible: boolean;
  openBillCount: number;
  totalBalance: number;
  overdueBalance: number;
}

export async function getVendorAccounting(
  input: GetVendorAccountingInput,
): Promise<VendorAccountingDetail> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      SELECT
        v.id,
        v.name,
        v.vendor_number,
        v.default_expense_account_id,
        ea.name AS default_expense_account_name,
        v.default_ap_account_id,
        apa.name AS default_ap_account_name,
        v.payment_terms_id,
        pt.name AS payment_terms_name,
        COALESCE(v.is_1099_eligible, false) AS is_1099_eligible,
        COALESCE(
          (SELECT COUNT(*)
           FROM ap_bills b
           WHERE b.vendor_id = v.id
             AND b.tenant_id = ${input.tenantId}
             AND b.status IN ('posted', 'partial')),
          0
        ) AS open_bill_count,
        COALESCE(
          (SELECT SUM(b.total_amount) - COALESCE(SUM(
            (SELECT COALESCE(SUM(pa.amount_applied), 0)
             FROM ap_payment_allocations pa
             INNER JOIN ap_payments p ON p.id = pa.payment_id
             WHERE pa.bill_id = b.id AND p.status != 'voided')
          ), 0)
           FROM ap_bills b
           WHERE b.vendor_id = v.id
             AND b.tenant_id = ${input.tenantId}
             AND b.status IN ('posted', 'partial')),
          0
        ) AS total_balance,
        COALESCE(
          (SELECT SUM(b.total_amount) - COALESCE(SUM(
            (SELECT COALESCE(SUM(pa.amount_applied), 0)
             FROM ap_payment_allocations pa
             INNER JOIN ap_payments p ON p.id = pa.payment_id
             WHERE pa.bill_id = b.id AND p.status != 'voided')
          ), 0)
           FROM ap_bills b
           WHERE b.vendor_id = v.id
             AND b.tenant_id = ${input.tenantId}
             AND b.status IN ('posted', 'partial')
             AND b.due_date::date < CURRENT_DATE),
          0
        ) AS overdue_balance
      FROM vendors v
      LEFT JOIN gl_accounts ea ON ea.id = v.default_expense_account_id
      LEFT JOIN gl_accounts apa ON apa.id = v.default_ap_account_id
      LEFT JOIN payment_terms pt ON pt.id = v.payment_terms_id
      WHERE v.id = ${input.vendorId}
        AND v.tenant_id = ${input.tenantId}
      LIMIT 1
    `);

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) {
      throw new NotFoundError('Vendor', input.vendorId);
    }

    const row = results[0]!;
    return {
      id: String(row.id),
      name: String(row.name),
      vendorNumber: row.vendor_number ? String(row.vendor_number) : null,
      defaultExpenseAccountId: row.default_expense_account_id ? String(row.default_expense_account_id) : null,
      defaultExpenseAccountName: row.default_expense_account_name ? String(row.default_expense_account_name) : null,
      defaultAPAccountId: row.default_ap_account_id ? String(row.default_ap_account_id) : null,
      defaultAPAccountName: row.default_ap_account_name ? String(row.default_ap_account_name) : null,
      paymentTermsId: row.payment_terms_id ? String(row.payment_terms_id) : null,
      paymentTermsName: row.payment_terms_name ? String(row.payment_terms_name) : null,
      is1099Eligible: Boolean(row.is_1099_eligible),
      openBillCount: Number(row.open_bill_count),
      totalBalance: Number(row.total_balance),
      overdueBalance: Number(row.overdue_balance),
    };
  });
}
