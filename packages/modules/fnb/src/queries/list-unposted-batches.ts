import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListUnpostedBatchesInput } from '../validation';

export interface UnpostedBatchItem {
  id: string;
  locationId: string;
  businessDate: string;
  status: string;
  reconciledAt: string | null;
  reconciledBy: string | null;
}

export async function listUnpostedBatches(
  input: ListUnpostedBatchesInput,
): Promise<UnpostedBatchItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`status = 'reconciled'`,
      sql`gl_journal_entry_id IS NULL`,
    ];

    if (input.locationId) {
      conditions.push(sql`location_id = ${input.locationId}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, location_id, business_date, status, reconciled_at, reconciled_by
          FROM fnb_close_batches
          WHERE ${whereClause}
          ORDER BY business_date ASC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      locationId: r.location_id as string,
      businessDate: r.business_date as string,
      status: r.status as string,
      reconciledAt: (r.reconciled_at as string) ?? null,
      reconciledBy: (r.reconciled_by as string) ?? null,
    }));
  });
}
