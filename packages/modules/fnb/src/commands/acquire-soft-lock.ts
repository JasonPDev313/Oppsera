import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { ulid } from '@oppsera/shared';
import type { AcquireSoftLockInput } from '../validation';
import { SoftLockHeldError } from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { SoftLockAcquiredPayload } from '../events/types';

export interface AcquireSoftLockResult {
  lockId: string;
  entityType: string;
  entityId: string;
  lockedBy: string;
  terminalId: string | null;
  expiresAt: string;
}

export async function acquireSoftLock(
  ctx: RequestContext,
  input: AcquireSoftLockInput,
): Promise<AcquireSoftLockResult> {
  const ttlSeconds = input.ttlSeconds ?? 30;
  const lockId = ulid();
  const terminalId = input.terminalId ?? null;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Clean any expired lock first
    await tx.execute(
      sql`DELETE FROM fnb_soft_locks
          WHERE tenant_id = ${ctx.tenantId}
            AND entity_type = ${input.entityType}
            AND entity_id = ${input.entityId}
            AND expires_at < NOW()`,
    );

    // Try to insert — ON CONFLICT DO NOTHING (another lock exists)
    const rows = await tx.execute(
      sql`INSERT INTO fnb_soft_locks (id, tenant_id, entity_type, entity_id, locked_by, terminal_id, locked_at, expires_at, last_heartbeat_at)
          VALUES (${lockId}, ${ctx.tenantId}, ${input.entityType}, ${input.entityId}, ${ctx.user.id}, ${terminalId}, NOW(), NOW() + ${ttlSeconds.toString() + ' seconds'}::interval, NOW())
          ON CONFLICT (tenant_id, entity_type, entity_id)
          DO NOTHING
          RETURNING id, entity_type, entity_id, locked_by, terminal_id, expires_at`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);

    if (results.length === 0) {
      // Lock already held — fetch holder info
      const existingRows = await tx.execute(
        sql`SELECT locked_by FROM fnb_soft_locks
            WHERE tenant_id = ${ctx.tenantId}
              AND entity_type = ${input.entityType}
              AND entity_id = ${input.entityId}`,
      );
      const existing = Array.from(existingRows as Iterable<Record<string, unknown>>);
      const lockedBy = existing[0]?.locked_by as string ?? 'unknown';
      throw new SoftLockHeldError(input.entityType, input.entityId, lockedBy);
    }

    const r = results[0]!;
    const lockResult: AcquireSoftLockResult = {
      lockId: r.id as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      lockedBy: r.locked_by as string,
      terminalId: (r.terminal_id as string) ?? null,
      expiresAt: String(r.expires_at),
    };

    const event = buildEventFromContext(ctx, FNB_EVENTS.SOFT_LOCK_ACQUIRED, {
      lockId: lockResult.lockId,
      entityType: lockResult.entityType,
      entityId: lockResult.entityId,
      lockedBy: lockResult.lockedBy,
      terminalId: lockResult.terminalId,
      expiresAt: lockResult.expiresAt,
    } satisfies SoftLockAcquiredPayload);

    return { result: lockResult, events: [event] };
  });

  await auditLog(ctx, 'fnb.lock.acquired', 'fnb_soft_lock', result.lockId);
  return result;
}
