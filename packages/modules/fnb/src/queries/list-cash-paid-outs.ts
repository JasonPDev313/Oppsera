import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListCashPaidOutsInput } from '../validation';

export interface CashPaidOutItem {
  id: string;
  locationId: string;
  closeBatchId: string | null;
  amountCents: number;
  reason: string;
  vendorName: string | null;
  employeeId: string;
  approvedBy: string | null;
  businessDate: string;
  createdAt: string;
}

export async function listCashPaidOuts(
  input: ListCashPaidOutsInput,
): Promise<CashPaidOutItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, location_id, close_batch_id, amount_cents,
                 reason, vendor_name, employee_id, approved_by,
                 business_date, created_at
          FROM fnb_cash_paid_outs
          WHERE tenant_id = ${input.tenantId}
            AND location_id = ${input.locationId}
            AND business_date = ${input.businessDate}
          ORDER BY created_at ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      locationId: r.location_id as string,
      closeBatchId: (r.close_batch_id as string) ?? null,
      amountCents: Number(r.amount_cents),
      reason: r.reason as string,
      vendorName: (r.vendor_name as string) ?? null,
      employeeId: r.employee_id as string,
      approvedBy: (r.approved_by as string) ?? null,
      businessDate: r.business_date as string,
      createdAt: r.created_at as string,
    }));
  });
}
