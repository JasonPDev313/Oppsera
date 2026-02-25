import { eq, and, isNull, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glTransactionTypeMappings } from '@oppsera/db';
import { getSystemTransactionType } from '@oppsera/shared/src/constants/transaction-types';
import type { DebitKind } from '@oppsera/shared/src/constants/transaction-types';
import type { DeleteTransactionTypeMappingInput } from '../validation';

/**
 * Delete a Credit/Debit mapping for a transaction type.
 *
 * For tender-category types whose source was 'backfilled', also clears
 * the corresponding field in `payment_type_gl_defaults` so the legacy
 * table stays in sync.
 */
export async function deleteTransactionTypeMapping(
  ctx: RequestContext,
  transactionTypeCode: string,
  input: DeleteTransactionTypeMappingInput,
) {
  const systemType = getSystemTransactionType(transactionTypeCode);
  const locationId = input.locationId ?? null;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Find the existing row
    const existing = await tx
      .select({
        id: glTransactionTypeMappings.id,
        source: glTransactionTypeMappings.source,
      })
      .from(glTransactionTypeMappings)
      .where(
        locationId
          ? and(
              eq(glTransactionTypeMappings.tenantId, ctx.tenantId),
              eq(glTransactionTypeMappings.transactionTypeCode, transactionTypeCode),
              eq(glTransactionTypeMappings.locationId, locationId),
            )
          : and(
              eq(glTransactionTypeMappings.tenantId, ctx.tenantId),
              eq(glTransactionTypeMappings.transactionTypeCode, transactionTypeCode),
              isNull(glTransactionTypeMappings.locationId),
            ),
      )
      .limit(1);

    if (existing.length === 0) {
      // Nothing to delete — idempotent
      return { result: { deleted: false }, events: [] };
    }

    const row = existing[0]!;

    // Delete the mapping row
    await tx
      .delete(glTransactionTypeMappings)
      .where(eq(glTransactionTypeMappings.id, row.id));

    // For tender types with backfilled source, also clear the legacy field
    if (systemType && systemType.category === 'tender' && !locationId) {
      const debitKind = systemType.defaultDebitKind as DebitKind;
      const clearField =
        debitKind === 'cash_bank' ? 'cash_account_id' :
        debitKind === 'clearing' ? 'clearing_account_id' :
        null;

      if (clearField) {
        await tx.execute(sql`
          UPDATE payment_type_gl_defaults
          SET ${sql.raw(clearField)} = NULL, updated_at = NOW()
          WHERE tenant_id = ${ctx.tenantId}
            AND payment_type_id = ${transactionTypeCode}
        `);
      }
    }

    const event = buildEventFromContext(ctx, 'accounting.transaction_type_mapping.deleted.v1', {
      transactionTypeCode,
      locationId,
    });

    return { result: { deleted: true }, events: [event] };
  });

  if (result.deleted) {
    await auditLog(
      ctx,
      'accounting.transaction_type_mapping.deleted',
      'gl_transaction_type_mappings',
      transactionTypeCode,
    );
  }

  return result;
}
