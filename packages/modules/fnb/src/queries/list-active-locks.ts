import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListActiveLocksInput } from '../validation';

export interface ActiveLockItem {
  lockId: string;
  entityType: string;
  entityId: string;
  lockedBy: string;
  terminalId: string | null;
  lockedAt: string;
  expiresAt: string;
}

export async function listActiveLocks(
  input: ListActiveLocksInput,
): Promise<ActiveLockItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const conditions: ReturnType<typeof sql>[] = [
      sql`tenant_id = ${input.tenantId}`,
      sql`expires_at > NOW()`,
    ];

    if (input.entityType) {
      conditions.push(sql`entity_type = ${input.entityType}`);
    }

    const whereClause = sql.join(conditions, sql` AND `);

    const rows = await tx.execute(
      sql`SELECT id, entity_type, entity_id, locked_by, terminal_id, locked_at, expires_at
          FROM fnb_soft_locks
          WHERE ${whereClause}
          ORDER BY locked_at DESC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      lockId: r.id as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      lockedBy: r.locked_by as string,
      terminalId: (r.terminal_id as string) ?? null,
      lockedAt: String(r.locked_at),
      expiresAt: String(r.expires_at),
    }));
  });
}
