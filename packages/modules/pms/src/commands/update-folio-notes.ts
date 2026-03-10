/**
 * Update notes on a folio.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsFolios } from '@oppsera/db';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { PMS_EVENTS } from '../events/types';

export async function updateFolioNotes(
  ctx: RequestContext,
  folioId: string,
  notes: string | null,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [folio] = await tx
      .select({ id: pmsFolios.id, propertyId: pmsFolios.propertyId, reservationId: pmsFolios.reservationId })
      .from(pmsFolios)
      .where(and(eq(pmsFolios.id, folioId), eq(pmsFolios.tenantId, ctx.tenantId)))
      .limit(1);
    if (!folio) throw new NotFoundError('Folio', folioId);

    await tx
      .update(pmsFolios)
      .set({ notes, updatedAt: new Date() })
      .where(and(eq(pmsFolios.id, folioId), eq(pmsFolios.tenantId, ctx.tenantId)));

    await pmsAuditLogEntry(tx, ctx, folio.propertyId, 'folio', folioId, 'notes_updated', { notes });

    const event = buildEventFromContext(ctx, PMS_EVENTS.FOLIO_NOTES_UPDATED, {
      folioId,
      reservationId: folio.reservationId,
      hasNotes: notes !== null && notes.trim().length > 0,
    });

    return { result: { folioId, notes }, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.folio.notes_updated', 'pms_folio', folioId);
  return result;
}
