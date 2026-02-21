/**
 * Post an entry to a folio.
 * Recalculates folio totals after posting.
 */
import { and, eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import { pmsFolios, pmsFolioEntries } from '@oppsera/db';
import type { PostFolioEntryInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { FolioNotOpenError } from '../errors';
import { recalculateFolioTotals } from '../helpers/folio-totals';

export async function postFolioEntry(
  ctx: RequestContext,
  folioId: string,
  input: PostFolioEntryInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load folio
    const [folio] = await tx
      .select()
      .from(pmsFolios)
      .where(and(eq(pmsFolios.id, folioId), eq(pmsFolios.tenantId, ctx.tenantId)))
      .limit(1);
    if (!folio) throw new NotFoundError('Folio', folioId);
    if (folio.status !== 'OPEN') throw new FolioNotOpenError(folioId);

    // Insert entry
    const entryId = generateUlid();
    const businessDate = new Date().toISOString().split('T')[0]!;
    await tx.insert(pmsFolioEntries).values({
      id: entryId,
      tenantId: ctx.tenantId,
      folioId,
      entryType: input.entryType,
      description: input.description,
      amountCents: input.amountCents,
      businessDate,
      sourceRef: input.sourceRef ?? null,
      postedBy: ctx.user.id,
    });

    // Recalculate folio totals
    await recalculateFolioTotals(tx, ctx.tenantId, folioId);

    await pmsAuditLogEntry(tx, ctx, folioId, 'folio', folioId, 'entry_posted', {
      entryId,
      entryType: input.entryType,
      amountCents: input.amountCents,
      description: input.description,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.FOLIO_CHARGE_POSTED, {
      folioId,
      reservationId: folio.reservationId,
      entryId,
      entryType: input.entryType,
      amountCents: input.amountCents,
    });

    return { result: { entryId, folioId }, events: [event] };
  });

  await auditLog(ctx, 'pms.folio.charge_posted', 'pms_folio', folioId);
  return result;
}
