/**
 * Close a folio.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError } from '@oppsera/shared';
import { pmsFolios } from '@oppsera/db';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { FolioNotOpenError } from '../errors';

export async function closeFolio(ctx: RequestContext, folioId: string) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [folio] = await tx
      .select()
      .from(pmsFolios)
      .where(and(eq(pmsFolios.id, folioId), eq(pmsFolios.tenantId, ctx.tenantId)))
      .limit(1);
    if (!folio) throw new NotFoundError('Folio', folioId);
    if (folio.status !== 'OPEN') throw new FolioNotOpenError(folioId);

    await tx
      .update(pmsFolios)
      .set({ status: 'CLOSED', updatedAt: new Date() })
      .where(and(eq(pmsFolios.id, folioId), eq(pmsFolios.tenantId, ctx.tenantId)));

    await pmsAuditLogEntry(tx, ctx, folioId, 'folio', folioId, 'closed', {
      totalCents: folio.totalCents,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.FOLIO_CLOSED, {
      folioId,
      reservationId: folio.reservationId,
      totalCents: folio.totalCents,
    });

    return { result: { folioId, status: 'CLOSED' }, events: [event] };
  });

  await auditLog(ctx, 'pms.folio.closed', 'pms_folio', folioId);
  return result;
}
