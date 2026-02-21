import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import type { RenewSoftLockInput } from '../validation';
import { SoftLockNotFoundError } from '../errors';

export interface RenewSoftLockResult {
  lockId: string;
  expiresAt: string;
  lastHeartbeatAt: string;
}

export async function renewSoftLock(
  ctx: RequestContext,
  input: RenewSoftLockInput,
): Promise<RenewSoftLockResult> {
  const ttlSeconds = input.ttlSeconds ?? 30;

  const result = await publishWithOutbox(ctx, async (tx) => {
    const rows = await tx.execute(
      sql`UPDATE fnb_soft_locks
          SET expires_at = NOW() + ${ttlSeconds.toString() + ' seconds'}::interval,
              last_heartbeat_at = NOW()
          WHERE id = ${input.lockId}
            AND tenant_id = ${ctx.tenantId}
            AND locked_by = ${ctx.user.id}
          RETURNING id, expires_at, last_heartbeat_at`,
    );

    const results = Array.from(rows as Iterable<Record<string, unknown>>);
    if (results.length === 0) {
      throw new SoftLockNotFoundError(input.lockId);
    }

    const r = results[0]!;
    return {
      result: {
        lockId: r.id as string,
        expiresAt: String(r.expires_at),
        lastHeartbeatAt: String(r.last_heartbeat_at),
      },
      events: [],
    };
  });

  return result;
}
