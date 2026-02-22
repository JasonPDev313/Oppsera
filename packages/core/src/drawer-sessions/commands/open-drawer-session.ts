import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { generateUlid, AppError } from '@oppsera/shared';
import { drawerSessions } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { OpenDrawerSessionInput } from '../validation';
import type { DrawerSession } from '../types';

function todayBusinessDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mapRow(row: typeof drawerSessions.$inferSelect): DrawerSession {
  return {
    id: row.id,
    tenantId: row.tenantId,
    locationId: row.locationId,
    terminalId: row.terminalId,
    profitCenterId: row.profitCenterId,
    employeeId: row.employeeId,
    businessDate: row.businessDate,
    status: row.status as 'open' | 'closed',
    openingBalanceCents: row.openingBalanceCents,
    changeFundCents: row.changeFundCents,
    closingCountCents: row.closingCountCents,
    expectedCashCents: row.expectedCashCents,
    varianceCents: row.varianceCents,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closedBy: row.closedBy,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function openDrawerSession(
  ctx: RequestContext,
  input: OpenDrawerSessionInput,
): Promise<DrawerSession> {
  const businessDate = input.businessDate ?? todayBusinessDate();

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check for existing open session on this terminal for this business date
    const [existing] = await tx
      .select()
      .from(drawerSessions)
      .where(
        and(
          eq(drawerSessions.tenantId, ctx.tenantId),
          eq(drawerSessions.terminalId, input.terminalId),
          eq(drawerSessions.businessDate, businessDate),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.status === 'open') {
        throw new AppError(
          'DRAWER_SESSION_ALREADY_OPEN',
          'A drawer session is already open on this terminal for today',
          409,
        );
      }
      // Already closed — can't reopen
      throw new AppError(
        'DRAWER_SESSION_ALREADY_CLOSED',
        'A drawer session was already opened and closed on this terminal today. Use a new business date.',
        409,
      );
    }

    const id = generateUlid();
    const [created] = await tx
      .insert(drawerSessions)
      .values({
        id,
        tenantId: ctx.tenantId,
        locationId: input.locationId,
        terminalId: input.terminalId,
        profitCenterId: input.profitCenterId ?? null,
        employeeId: ctx.user.id,
        businessDate,
        status: 'open',
        openingBalanceCents: input.openingBalanceCents ?? 0,
        changeFundCents: input.changeFundCents ?? 0,
        openedAt: new Date(),
      })
      .returning();

    const event = buildEventFromContext(ctx, 'drawer.session.opened.v1', {
      drawerSessionId: created!.id,
      terminalId: input.terminalId,
      locationId: input.locationId,
      employeeId: ctx.user.id,
      businessDate,
      openingBalanceCents: input.openingBalanceCents ?? 0,
      changeFundCents: input.changeFundCents ?? 0,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'drawer.session.opened', 'drawer_session', result.id);
  return mapRow(result);
}
