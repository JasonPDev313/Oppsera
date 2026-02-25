import { eq, and, isNull, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts, glTransactionTypeMappings, paymentTypeGlDefaults } from '@oppsera/db';
import { NotFoundError, AppError, generateUlid } from '@oppsera/shared';
import {
  getSystemTransactionType,
  DEBIT_KIND_VALID_ACCOUNT_TYPES,
} from '@oppsera/shared/src/constants/transaction-types';
import type { DebitKind } from '@oppsera/shared/src/constants/transaction-types';
import type { SaveTransactionTypeMappingInput } from '../validation';

/**
 * Save (upsert) a Credit/Debit mapping for a transaction type.
 *
 * For tender-category types, smart-backfills `payment_type_gl_defaults` so the
 * POS adapter continues working unchanged.
 */
export async function saveTransactionTypeMapping(
  ctx: RequestContext,
  transactionTypeCode: string,
  input: SaveTransactionTypeMappingInput,
) {
  const systemType = getSystemTransactionType(transactionTypeCode);
  const locationId = input.locationId ?? null;

  const result = await publishWithOutbox(ctx, async (tx) => {
    // ── Validate referenced account IDs ─────────────────────────
    const accountIds: string[] = [];
    if (input.creditAccountId) accountIds.push(input.creditAccountId);
    if (input.debitAccountId) accountIds.push(input.debitAccountId);

    const accountMap = new Map<string, { id: string; accountType: string }>();
    if (accountIds.length > 0) {
      const accounts = await tx
        .select({ id: glAccounts.id, accountType: glAccounts.accountType })
        .from(glAccounts)
        .where(and(eq(glAccounts.tenantId, ctx.tenantId)));

      for (const a of accounts) {
        accountMap.set(a.id, a);
      }

      for (const id of accountIds) {
        if (!accountMap.has(id)) {
          throw new NotFoundError('GL Account', id);
        }
      }
    }

    // ── Validate debit account type for tender types ────────────
    if (systemType && systemType.category === 'tender' && input.debitAccountId) {
      const debitKind = systemType.defaultDebitKind as DebitKind;
      const validTypes = DEBIT_KIND_VALID_ACCOUNT_TYPES[debitKind];
      if (validTypes && validTypes.length > 0) {
        const account = accountMap.get(input.debitAccountId);
        if (account && !validTypes.includes(account.accountType)) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Debit kind '${debitKind}' requires an account of type ${validTypes.join(' or ')}, but the selected account is type '${account.accountType}'.`,
            400,
          );
        }
      }
    }

    // ── UPSERT into gl_transaction_type_mappings ────────────────
    const existing = await tx
      .select({ id: glTransactionTypeMappings.id })
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

    let mapping;
    if (existing.length > 0) {
      [mapping] = await tx
        .update(glTransactionTypeMappings)
        .set({
          creditAccountId: input.creditAccountId ?? null,
          debitAccountId: input.debitAccountId ?? null,
          source: 'manual',
          updatedAt: new Date(),
        })
        .where(eq(glTransactionTypeMappings.id, existing[0]!.id))
        .returning();
    } else {
      [mapping] = await tx
        .insert(glTransactionTypeMappings)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          transactionTypeCode,
          locationId,
          creditAccountId: input.creditAccountId ?? null,
          debitAccountId: input.debitAccountId ?? null,
          source: 'manual',
        })
        .returning();
    }

    // ── Smart backfill to payment_type_gl_defaults (tender only) ─
    if (systemType && systemType.category === 'tender' && input.debitAccountId && !locationId) {
      const debitKind = systemType.defaultDebitKind as DebitKind;

      // Only backfill one field, determined by debitKind
      const backfillField =
        debitKind === 'cash_bank' ? 'cash_account_id' :
        debitKind === 'clearing' ? 'clearing_account_id' :
        null;

      if (backfillField) {
        await tx.execute(sql`
          INSERT INTO payment_type_gl_defaults (tenant_id, payment_type_id, ${sql.raw(backfillField)}, updated_at)
          VALUES (${ctx.tenantId}, ${transactionTypeCode}, ${input.debitAccountId}, NOW())
          ON CONFLICT (tenant_id, payment_type_id)
          DO UPDATE SET ${sql.raw(backfillField)} = ${input.debitAccountId}, updated_at = NOW()
        `);
      }
    }

    const event = buildEventFromContext(ctx, 'accounting.transaction_type_mapping.saved.v1', {
      transactionTypeCode,
      creditAccountId: input.creditAccountId ?? null,
      debitAccountId: input.debitAccountId ?? null,
      locationId,
    });

    return { result: mapping!, events: [event] };
  });

  await auditLog(
    ctx,
    'accounting.transaction_type_mapping.saved',
    'gl_transaction_type_mappings',
    transactionTypeCode,
  );

  return result;
}
