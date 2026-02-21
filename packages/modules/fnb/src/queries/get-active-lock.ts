import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import type { GetActiveLockInput } from '../validation';

export interface ActiveLockDetail {
  lockId: string;
  entityType: string;
  entityId: string;
  lockedBy: string;
  terminalId: string | null;
  lockedAt: string;
  expiresAt: string;
  lastHeartbeatAt: string;
}

export async function getActiveLock(
  input: GetActiveLockInput,
): Promise<ActiveLockDetail | null> {
  return withTenant(input.tenantId, async (tx) => {
    const rows = await tx.execute(
      sql`SELECT id, entity_type, entity_id, locked_by, terminal_id, locked_at, expires_at, last_heartbeat_at
          FROM fnb_soft_locks
          WHERE tenant_id = ${input.tenantId}
            AND entity_type = ${input.entityType}
            AND entity_id = ${input.entityId}
            AND expires_at > NOW()`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) return null;

    const r = results[0]!;
    return {
      lockId: r.id as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      lockedBy: r.locked_by as string,
      terminalId: (r.terminal_id as string) ?? null,
      lockedAt: String(r.locked_at),
      expiresAt: String(r.expires_at),
      lastHeartbeatAt: String(r.last_heartbeat_at),
    };
  });
}
