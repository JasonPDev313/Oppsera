import { sql } from 'drizzle-orm';
import type { Database } from '@oppsera/db';

export async function generateJournalNumber(tx: Database, tenantId: string): Promise<number> {
  const result = await tx.execute(sql`
    INSERT INTO gl_journal_number_counters (tenant_id, last_number)
    VALUES (${tenantId}, 1)
    ON CONFLICT (tenant_id) DO UPDATE
    SET last_number = gl_journal_number_counters.last_number + 1
    RETURNING last_number
  `);

  const rows = Array.from(result as Iterable<{ last_number: number | string }>);
  return Number(rows[0]!.last_number);
}
