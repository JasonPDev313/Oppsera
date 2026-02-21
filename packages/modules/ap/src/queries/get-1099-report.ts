import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface Get1099ReportInput {
  tenantId: string;
  year: number;
}

export interface Vendor1099Row {
  vendorId: string;
  vendorName: string;
  vendorNumber: string | null;
  taxId: string | null;
  totalPaid: number;
  paymentCount: number;
}

export interface Report1099 {
  year: number;
  vendors: Vendor1099Row[];
  totalPaid: number;
  vendorCount: number;
}

export async function get1099Report(input: Get1099ReportInput): Promise<Report1099> {
  return withTenant(input.tenantId, async (tx) => {
    const startDate = `${input.year}-01-01`;
    const endDate = `${input.year}-12-31`;

    const rows = await tx.execute(sql`
      SELECT
        v.id AS vendor_id,
        v.name AS vendor_name,
        v.vendor_number,
        v.tax_id,
        COALESCE(SUM(p.amount::numeric), 0) AS total_paid,
        COUNT(p.id)::int AS payment_count
      FROM vendors v
      LEFT JOIN ap_payments p ON p.vendor_id = v.id
        AND p.tenant_id = v.tenant_id
        AND p.status = 'posted'
        AND p.payment_date BETWEEN ${startDate} AND ${endDate}
      WHERE v.tenant_id = ${input.tenantId}
        AND v.is_1099_eligible = true
      GROUP BY v.id, v.name, v.vendor_number, v.tax_id
      ORDER BY v.name
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);
    const vendors = allRows.map((row) => ({
      vendorId: String(row.vendor_id),
      vendorName: String(row.vendor_name),
      vendorNumber: row.vendor_number ? String(row.vendor_number) : null,
      taxId: row.tax_id ? String(row.tax_id) : null,
      totalPaid: Number(row.total_paid),
      paymentCount: Number(row.payment_count),
    }));

    const totalPaid = vendors.reduce((s, v) => s + v.totalPaid, 0);

    return {
      year: input.year,
      vendors,
      totalPaid,
      vendorCount: vendors.length,
    };
  });
}
