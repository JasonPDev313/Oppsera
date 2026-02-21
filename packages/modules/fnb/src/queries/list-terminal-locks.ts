import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { ListTerminalLocksInput } from '../validation';

export interface TerminalLockItem {
  lockId: string;
  entityType: string;
  entityId: string;
  lockedAt: string;
  expiresAt: string;
}

export async function listTerminalLocks(
  input: ListTerminalLocksInput,
): Promise<TerminalLockItem[]> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, entity_type, entity_id, locked_at, expires_at
          FROM fnb_soft_locks
          WHERE tenant_id = ${input.tenantId}
            AND terminal_id = ${input.terminalId}
            AND expires_at > NOW()
          ORDER BY locked_at DESC`,
    );

    return Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      lockId: r.id as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      lockedAt: String(r.locked_at),
      expiresAt: String(r.expires_at),
    }));
  });
}
