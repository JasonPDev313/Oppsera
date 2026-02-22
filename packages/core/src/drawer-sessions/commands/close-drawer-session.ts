import type { RequestContext } from '../../auth/context';
import { publishWithOutbox } from '../../events/publish-with-outbox';
import { buildEventFromContext } from '../../events/build-event';
import { auditLog } from '../../audit/helpers';
import { NotFoundError, AppError } from '@oppsera/shared';
import { drawerSessions, drawerSessionEvents } from '@oppsera/db';
import { sql } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CloseDrawerSessionInput } from '../validation';
import type { DrawerSession } from '../types';

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

export async function closeDrawerSession(
  ctx: RequestContext,
  input: CloseDrawerSessionInput,
): Promise<DrawerSession> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch session with FOR UPDATE lock
    const lockResult = await tx.execute(
      sql`SELECT * FROM drawer_sessions
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
        'This drawer session is not open',
        409,
      );
    }

    // Compute expected cash from events
    const eventRows = await tx
      .select()
      .from(drawerSessionEvents)
      .where(
        and(
          eq(drawerSessionEvents.tenantId, ctx.tenantId),
          eq(drawerSessionEvents.drawerSessionId, input.drawerSessionId),
        ),
      );

    let paidInTotal = 0;
    let paidOutTotal = 0;
    let cashDropTotal = 0;

    for (const evt of eventRows) {
      if (evt.eventType === 'paid_in') paidInTotal += evt.amountCents;
      if (evt.eventType === 'paid_out') paidOutTotal += evt.amountCents;
      if (evt.eventType === 'cash_drop') cashDropTotal += evt.amountCents;
    }

    // Compute cash received from tenders for this terminal's business date
    const tenderResult = await tx.execute(
      sql`SELECT
            COALESCE(SUM(CASE WHEN t.tender_type = 'cash' THEN t.amount ELSE 0 END), 0) as cash_received,
            COALESCE(SUM(CASE WHEN t.tender_type = 'cash' THEN t.change_given ELSE 0 END), 0) as change_given,
            COALESCE(SUM(t.tip_amount), 0) as tips_collected
          FROM tenders t
          WHERE t.tenant_id = ${ctx.tenantId}
            AND t.terminal_id = ${session.terminal_id as string}
            AND t.business_date = ${session.business_date as string}
            AND t.status = 'captured'`,
    );

    const tenderAgg = Array.from(tenderResult as Iterable<Record<string, unknown>>)[0] ?? {};
    const cashReceived = Number(tenderAgg.cash_received ?? 0);
    const changeGiven = Number(tenderAgg.change_given ?? 0);

    const openingBalance = session.opening_balance_cents as number;
    const changeFund = (session.change_fund_cents as number) ?? 0;

    // Expected = opening + changeFund + cash sales + paid_in - paid_out - cash_drops - change_given
    const expectedCashCents =
      openingBalance + changeFund + cashReceived + paidInTotal - paidOutTotal - cashDropTotal - changeGiven;

    const varianceCents = input.closingCountCents - expectedCashCents;

    const [updated] = await tx
      .update(drawerSessions)
      .set({
        status: 'closed',
        closingCountCents: input.closingCountCents,
        expectedCashCents,
        varianceCents,
        closedAt: new Date(),
        closedBy: ctx.user.id,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(drawerSessions.tenantId, ctx.tenantId),
          eq(drawerSessions.id, input.drawerSessionId),
        ),
      )
      .returning();

    const event = buildEventFromContext(ctx, 'drawer.session.closed.v1', {
      drawerSessionId: updated!.id,
      terminalId: updated!.terminalId,
      locationId: updated!.locationId,
      businessDate: updated!.businessDate,
      closingCountCents: input.closingCountCents,
      expectedCashCents,
      varianceCents,
      closedBy: ctx.user.id,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'drawer.session.closed', 'drawer_session', result.id);
  return mapRow(result);
}
