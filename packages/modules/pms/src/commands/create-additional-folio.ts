/**
 * Create an additional folio for a reservation (split billing).
 * Each reservation starts with Folio #1 (Guest). This creates Folio #2, #3, etc.
 */
import { and, eq, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsFolios, pmsReservations } from '@oppsera/db';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function createAdditionalFolio(
  ctx: RequestContext,
  reservationId: string,
  label: string,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load reservation
    const [reservation] = await tx
      .select({ id: pmsReservations.id, propertyId: pmsReservations.propertyId, guestId: pmsReservations.guestId })
      .from(pmsReservations)
      .where(and(eq(pmsReservations.id, reservationId), eq(pmsReservations.tenantId, ctx.tenantId)))
      .limit(1);
    if (!reservation) throw new NotFoundError('Reservation', reservationId);

    // Advisory lock serializes concurrent folio inserts for the same property.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext(${ctx.tenantId} || ':folio:' || ${reservation.propertyId})::bigint)
    `);
    const [{ nextNum }] = await tx.execute(sql`
      SELECT COALESCE(MAX(folio_number), 0) + 1 AS "nextNum"
      FROM pms_folios
      WHERE tenant_id = ${ctx.tenantId} AND property_id = ${reservation.propertyId}
    `) as unknown as [{ nextNum: number }];

    const folioId = generateUlid();
    await tx.insert(pmsFolios).values({
      id: folioId,
      tenantId: ctx.tenantId,
      propertyId: reservation.propertyId,
      reservationId,
      guestId: reservation.guestId,
      status: 'OPEN',
      folioNumber: Number(nextNum),
      label,
      createdBy: ctx.user.id,
    });

    await pmsAuditLogEntry(tx, ctx, reservation.propertyId, 'folio', folioId, 'created', {
      reservationId,
      label,
      folioNumber: Number(nextNum),
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.FOLIO_CREATED, {
      folioId,
      reservationId,
      label,
      folioNumber: Number(nextNum),
    });

    return { result: { folioId, folioNumber: Number(nextNum), label }, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.folio.created', 'pms_folio', result.folioId);
  return result;
}
