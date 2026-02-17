import { sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';

export async function getNextOrderNumber(
  tx: Database,
  tenantId: string,
  locationId: string,
): Promise<string> {
  const result = await (tx as any).execute(sql`
    INSERT INTO order_counters (tenant_id, location_id, last_number)
    VALUES (${tenantId}, ${locationId}, 1)
    ON CONFLICT (tenant_id, location_id)
    DO UPDATE SET last_number = order_counters.last_number + 1
    RETURNING last_number
  `);
  const rows = Array.from(result as Iterable<{ last_number: number }>);
  return String(rows[0]!.last_number).padStart(4, '0');
}
