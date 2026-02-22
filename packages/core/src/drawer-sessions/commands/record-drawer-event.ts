import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';
import { drawerSessions, drawerSessionEvents } from '@oppsera/db';
import { sql } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RecordDrawerEventInput } from '../validation';
import type { DrawerSessionEvent } from '../types';

export function mapEventRow(row: typeof drawerSessionEvents.$inferSelect): DrawerSessionEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    drawerSessionId: row.drawerSessionId,
    eventType: row.eventType as DrawerSessionEvent['eventType'],
    amountCents: row.amountCents,
    reason: row.reason,
    employeeId: row.employeeId,
    approvedBy: row.approvedBy,
    bagId: row.bagId,
    sealNumber: row.sealNumber,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    depositSlipId: row.depositSlipId,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recordDrawerEvent(
  ctx: RequestContext,
  input: RecordDrawerEventInput,
): Promise<DrawerSessionEvent> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate session exists and is open
    const lockResult = await tx.execute(
      sql`SELECT id, status, tenant_id FROM drawer_sessions
          WHERE tenant_id = ${ctx.tenantId} AND id = ${input.drawerSessionId}
          FOR UPDATE`,
    );
    const rows = Array.from(lockResult as Iterable<Record<string, unknown>>);
    if (rows.length === 0) {
      throw new NotFoundError('DrawerSession', input.drawerSessionId);
    }

    const session = rows[0]!;
    if (session.status !== 'open') {
      throw new AppError(
        'DRAWER_SESSION_NOT_OPEN',
        'Cannot record events on a closed drawer session',
        409,
      );
    }

    // Validate amount for paid_in/paid_out/cash_drop (must be > 0)
    if (['paid_in', 'paid_out', 'cash_drop'].includes(input.eventType)) {
      if (!input.amountCents || input.amountCents <= 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Amount is required for ${input.eventType} events`,
          400,
        );
      }
    }

    const id = generateUlid();
    const [created] = await tx
      .insert(drawerSessionEvents)
      .values({
        id,
        tenantId: ctx.tenantId,
        drawerSessionId: input.drawerSessionId,
        eventType: input.eventType,
        amountCents: input.amountCents ?? 0,
        reason: input.reason ?? null,
        employeeId: ctx.user.id,
        approvedBy: input.approvedBy ?? null,
        // Cash drop enhancements
        bagId: input.eventType === 'cash_drop' ? (input.bagId ?? null) : null,
        sealNumber: input.eventType === 'cash_drop' ? (input.sealNumber ?? null) : null,
      })
      .returning();

    // Update session updatedAt
    await tx
      .update(drawerSessions)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(drawerSessions.tenantId, ctx.tenantId),
          eq(drawerSessions.id, input.drawerSessionId),
        ),
      );

    const event = buildEventFromContext(ctx, 'drawer.event.recorded.v1', {
      drawerSessionEventId: created!.id,
      drawerSessionId: input.drawerSessionId,
      eventType: input.eventType,
      amountCents: input.amountCents ?? 0,
      employeeId: ctx.user.id,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'drawer.event.recorded', 'drawer_session_event', result.id, undefined, {
    amountCents: input.amountCents ?? 0,
    eventType: input.eventType,
    bagId: input.bagId,
    sealNumber: input.sealNumber,
  });
  return mapEventRow(result);
}
