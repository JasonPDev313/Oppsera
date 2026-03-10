/**
 * Void a folio entry by posting a reversal and marking the original as voided.
 */
import { and, eq, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import { pmsFolios } from '@oppsera/db';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';
import { FolioNotOpenError } from '../errors';
import { recalculateFolioTotals } from '../helpers/folio-totals';

export async function voidFolioEntry(
  ctx: RequestContext,
  folioId: string,
  entryId: string,
  reason: string,
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

    // Load the entry to void
    const entryRows = await tx.execute(sql`
      SELECT id, entry_type, description, amount_cents, business_date, department_code, voided_at
      FROM pms_folio_entries
      WHERE id = ${entryId}
        AND tenant_id = ${ctx.tenantId}
        AND folio_id = ${folioId}
      LIMIT 1
    `);
    const entryArr = Array.from(entryRows as Iterable<Record<string, unknown>>);
    if (entryArr.length === 0) throw new NotFoundError('Folio entry', entryId);
    const entry = entryArr[0]!;

    // Prevent double-void
    if (entry.voided_at) {
      throw new ValidationError('Entry already voided', [
        { field: 'entryId', message: 'This entry has already been voided' },
      ]);
    }

    const amountCents = Number(entry.amount_cents);
    const businessDate = new Date().toISOString().split('T')[0]!;

    // Insert reversal entry
    const reversalId = generateUlid();
    await tx.execute(sql`
      INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, department_code, posted_by, voided_entry_id)
      VALUES (
        ${reversalId}, ${ctx.tenantId}, ${folioId},
        'ADJUSTMENT',
        ${'VOID: ' + reason + ' (ref: ' + String(entry.description ?? '') + ')'},
        ${-amountCents},
        ${businessDate},
        ${entry.department_code ?? null},
        ${ctx.user.id},
        ${entryId}
      )
    `);

    // Mark original entry as voided
    await tx.execute(sql`
      UPDATE pms_folio_entries
      SET voided_at = now(), voided_by = ${ctx.user.id}
      WHERE id = ${entryId} AND tenant_id = ${ctx.tenantId}
    `);

    // Recalculate folio totals
    await recalculateFolioTotals(tx, ctx.tenantId, folioId);

    await pmsAuditLogEntry(tx, ctx, folio.propertyId, 'folio', folioId, 'entry_voided', {
      entryId,
      reversalId,
      amountCents,
      reason,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.FOLIO_ENTRY_VOIDED, {
      folioId,
      entryId,
      reversalId,
      amountCents,
      reason,
    });

    return { result: { reversalId, entryId, folioId }, events: [event] };
  });

  auditLogDeferred(ctx, 'pms.folio.entry_voided', 'pms_folio', folioId);
  return result;
}
