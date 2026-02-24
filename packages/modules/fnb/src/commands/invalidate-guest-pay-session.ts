import { sql } from 'drizzle-orm';
import type { RequestContext } from '@oppsera/core/auth/context';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit';
import { generateUlid } from '@oppsera/shared';
import { FNB_EVENTS } from '../events/types';
import type { GuestPaySessionInvalidatedPayload } from '../events/types';
import type { InvalidateGuestPaySessionInput } from '../validation';

export async function invalidateGuestPaySession(
  ctx: RequestContext,
  locationId: string,
  input: InvalidateGuestPaySessionInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch session
    const sessions = await tx.execute(
      sql`SELECT id, tab_id, status, location_id
          FROM guest_pay_sessions
          WHERE id = ${input.sessionId} AND tenant_id = ${ctx.tenantId}
          FOR UPDATE`,
    );
    const rows = Array.from(sessions as Iterable<Record<string, unknown>>);
    if (rows.length === 0) {
      throw new Error(`Guest pay session ${input.sessionId} not found`);
    }

    const session = rows[0]!;
    const status = session.status as string;

    if (status !== 'active') {
      throw new Error(`Cannot invalidate session in status '${status}'`);
    }

    // Update to invalidated
    await tx.execute(
      sql`UPDATE guest_pay_sessions
          SET status = 'invalidated', updated_at = NOW()
          WHERE id = ${input.sessionId}`,
    );

    // Audit
    const auditId = generateUlid();
    await tx.execute(
      sql`INSERT INTO guest_pay_audit_log (id, tenant_id, session_id, action, actor_type, actor_id, metadata)
          VALUES (${auditId}, ${ctx.tenantId}, ${input.sessionId},
                  'session_invalidated', 'staff', ${ctx.user.id},
                  ${JSON.stringify({ reason: input.reason ?? null })}::jsonb)`,
    );

    const payload: GuestPaySessionInvalidatedPayload = {
      sessionId: input.sessionId,
      tabId: session.tab_id as string,
      locationId: session.location_id as string,
      reason: input.reason ?? null,
      invalidatedBy: ctx.user.id,
    };

    const event = buildEventFromContext(
      ctx,
      FNB_EVENTS.GUEST_PAY_SESSION_INVALIDATED,
      payload as unknown as Record<string, unknown>,
    );

    return { result: { sessionId: input.sessionId, status: 'invalidated' }, events: [event] };
  });

  await auditLog(ctx, 'fnb.guestpay.session_invalidated', 'guest_pay_sessions', input.sessionId);
  return result;
}
