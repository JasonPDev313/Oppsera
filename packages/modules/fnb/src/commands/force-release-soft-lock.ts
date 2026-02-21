import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import type { ForceReleaseSoftLockInput } from '../validation';
import { SoftLockNotFoundError } from '../errors';
import { FNB_EVENTS } from '../events/types';
import type { SoftLockReleasedPayload } from '../events/types';

export async function forceReleaseSoftLock(
  ctx: RequestContext,
  input: ForceReleaseSoftLockInput,
): Promise<void> {
  await publishWithOutbox(ctx, async (tx) => {
    const rows = await tx.execute(
      sql`DELETE FROM fnb_soft_locks
          WHERE tenant_id = ${ctx.tenantId}
            AND entity_type = ${input.entityType}
            AND entity_id = ${input.entityId}
          RETURNING id, entity_type, entity_id`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) {
      throw new SoftLockNotFoundError(`${input.entityType}:${input.entityId}`);
    }

    const r = results[0]!;
    const event = buildEventFromContext(ctx, FNB_EVENTS.SOFT_LOCK_RELEASED, {
      lockId: r.id as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      releasedBy: ctx.user.id,
      forced: true,
    } satisfies SoftLockReleasedPayload);

    return { result: undefined, events: [event] };
  });

  await auditLog(ctx, 'fnb.lock.force_released', 'fnb_soft_lock', `${input.entityType}:${input.entityId}`);
}
