import { eq, and, sql } from 'drizzle-orm';
import { recalculateFolioTotals } from '../helpers/folio-totals';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import { generateUlid, NotFoundError, ValidationError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';
import { pmsFolios } from '@oppsera/db';
import type { TransferFolioEntryInput } from '../validation';
import { PMS_EVENTS } from '../events/types';
import { pmsAuditLogEntry } from '../helpers/pms-audit';

export async function transferFolioEntry(
  ctx: RequestContext,
  input: TransferFolioEntryInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate source folio
    const [fromFolio] = await tx
      .select()
      .from(pmsFolios)
      .where(and(eq(pmsFolios.id, input.fromFolioId), eq(pmsFolios.tenantId, ctx.tenantId)))
      .limit(1);
    if (!fromFolio) throw new NotFoundError('Folio', input.fromFolioId);
    if (fromFolio.status === 'CLOSED') {
      throw new ValidationError('Source folio is closed', [
        { field: 'fromFolioId', message: 'Folio is closed and cannot be modified' },
      ]);
    }

    // Validate destination folio
    const [toFolio] = await tx
      .select()
      .from(pmsFolios)
      .where(and(eq(pmsFolios.id, input.toFolioId), eq(pmsFolios.tenantId, ctx.tenantId)))
      .limit(1);
    if (!toFolio) throw new NotFoundError('Folio', input.toFolioId);
    if (toFolio.status === 'CLOSED') {
      throw new ValidationError('Destination folio is closed', [
        { field: 'toFolioId', message: 'Folio is closed and cannot receive transfers' },
      ]);
    }

    // Fetch the entry
    const entryRows = await tx.execute(sql`
      SELECT id, entry_type, description, amount_cents, business_date, department_code
      FROM pms_folio_entries
      WHERE id = ${input.folioEntryId}
        AND tenant_id = ${ctx.tenantId}
        AND folio_id = ${input.fromFolioId}
      LIMIT 1
    `);
    const entryArr = Array.from(entryRows as Iterable<Record<string, unknown>>);
    if (entryArr.length === 0) throw new NotFoundError('Folio entry', input.folioEntryId);
    const entry = entryArr[0]!;
    const amountCents = Number(entry.amount_cents);

    // Insert reversal on source folio
    const reversalId = generateUlid();
    await tx.execute(sql`
      INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, department_code, posted_by)
      VALUES (
        ${reversalId}, ${ctx.tenantId}, ${input.fromFolioId},
        'ADJUSTMENT',
        ${'Transfer out: ' + String(entry.description ?? '')},
        ${-amountCents},
        ${entry.business_date ?? new Date().toISOString().split('T')[0]},
        ${entry.department_code ?? null},
        ${ctx.user.id}
      )
    `);

    // Insert on destination folio
    const newEntryId = generateUlid();
    await tx.execute(sql`
      INSERT INTO pms_folio_entries (id, tenant_id, folio_id, entry_type, description, amount_cents, business_date, department_code, posted_by)
      VALUES (
        ${newEntryId}, ${ctx.tenantId}, ${input.toFolioId},
        ${entry.entry_type},
        ${'Transfer in: ' + String(entry.description ?? '')},
        ${amountCents},
        ${entry.business_date ?? new Date().toISOString().split('T')[0]},
        ${entry.department_code ?? null},
        ${ctx.user.id}
      )
    `);

    // Recalculate both folio totals using the canonical helper
    for (const fId of [input.fromFolioId, input.toFolioId]) {
      await recalculateFolioTotals(tx, ctx.tenantId, fId);
    }

    await pmsAuditLogEntry(tx, ctx, fromFolio.propertyId, 'folio', input.fromFolioId, 'entry_transferred', {
      entryId: input.folioEntryId,
      toFolioId: input.toFolioId,
      amountCents,
    });

    const event = buildEventFromContext(ctx, PMS_EVENTS.FOLIO_ENTRY_TRANSFERRED, {
      folioEntryId: input.folioEntryId,
      fromFolioId: input.fromFolioId,
      toFolioId: input.toFolioId,
      amountCents,
    });

    return {
      result: { reversalEntryId: reversalId, newEntryId, amountCents },
      events: [event],
    };
  });

  auditLogDeferred(ctx, 'pms.folio.entry_transferred', 'pms_folio', input.fromFolioId);
  return result;
}
