import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListCashDropsInput } from '../validation';

export interface CashDropItem {
  id: string;
  locationId: string;
  closeBatchId: string | null;
  amountCents: number;
  employeeId: string;
  terminalId: string | null;
  businessDate: string;
  notes: string | null;
  createdAt: string;
}

export async function listCashDrops(
  input: ListCashDropsInput,
): Promise<CashDropItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, location_id, close_batch_id, amount_cents,
                 employee_id, terminal_id, business_date, notes, created_at
          FROM fnb_cash_drops
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
      employeeId: r.employee_id as string,
      terminalId: (r.terminal_id as string) ?? null,
      businessDate: r.business_date as string,
      notes: (r.notes as string) ?? null,
      createdAt: r.created_at as string,
    }));
  });
}
