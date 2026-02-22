import type { RequestContext } from '../../auth/context';
import { auditLog } from '../../audit/helpers';
import { NotFoundError, AppError } from '@oppsera/shared';
import { drawerSessionEvents } from '@oppsera/db';
import { withTenant } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { VerifyCashDropInput } from '../validation';
import type { DrawerSessionEvent } from '../types';
import { mapEventRow } from './record-drawer-event';

export async function verifyCashDrop(
  ctx: RequestContext,
  input: VerifyCashDropInput,
): Promise<DrawerSessionEvent> {
  return withTenant(ctx.tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(drawerSessionEvents)
      .where(
        and(
          eq(drawerSessionEvents.id, input.eventId),
          eq(drawerSessionEvents.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundError('DrawerSessionEvent', input.eventId);
    }

    if (row.eventType !== 'cash_drop') {
      throw new AppError('VALIDATION_ERROR', 'Only cash_drop events can be verified', 400);
    }

    if (row.verifiedBy) {
      throw new AppError('ALREADY_VERIFIED', 'This cash drop has already been verified', 409);
    }

    if (row.employeeId === ctx.user.id) {
      throw new AppError(
        'SELF_VERIFICATION_NOT_ALLOWED',
        'Cash drops must be verified by a different user',
        400,
      );
    }

    const [updated] = await tx
      .update(drawerSessionEvents)
      .set({
        verifiedBy: ctx.user.id,
        verifiedAt: new Date(),
      })
      .where(eq(drawerSessionEvents.id, input.eventId))
      .returning();

    await auditLog(ctx, 'drawer.cash_drop.verified', 'drawer_session_event', input.eventId, undefined, {
      amountCents: row.amountCents,
      bagId: row.bagId,
      sealNumber: row.sealNumber,
      verifiedBy: ctx.user.id,
    });

    return mapEventRow(updated!);
  });
}
