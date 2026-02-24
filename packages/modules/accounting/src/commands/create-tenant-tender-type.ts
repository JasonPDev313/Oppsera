import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts, tenantTenderTypes, glTransactionTypes } from '@oppsera/db';
import { generateUlid, NotFoundError, AppError } from '@oppsera/shared';
import type { CreateTenantTenderTypeInput } from '../validation';

export async function createTenantTenderType(
  ctx: RequestContext,
  input: CreateTenantTenderTypeInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Check for duplicate code
    const existing = await tx.execute(sql`
      SELECT id FROM tenant_tender_types
      WHERE tenant_id = ${ctx.tenantId} AND code = ${input.code}
      LIMIT 1
    `);
    const existingArr = Array.from(existing as Iterable<Record<string, unknown>>);
    if (existingArr.length > 0) {
      throw new AppError('DUPLICATE_CODE', `Tender type with code '${input.code}' already exists`, 409);
    }

    // Also check it doesn't clash with a system transaction type code
    const systemCode = await tx.execute(sql`
      SELECT id FROM gl_transaction_types
      WHERE tenant_id IS NULL AND code = ${input.code}
      LIMIT 1
    `);
    const systemArr = Array.from(systemCode as Iterable<Record<string, unknown>>);
    if (systemArr.length > 0) {
      throw new AppError('DUPLICATE_CODE', `Code '${input.code}' conflicts with a system transaction type`, 409);
    }

    // Validate referenced account IDs
    const accountIds: string[] = [];
    if (input.defaultClearingAccountId) accountIds.push(input.defaultClearingAccountId);
    if (input.defaultBankAccountId) accountIds.push(input.defaultBankAccountId);
    if (input.defaultFeeAccountId) accountIds.push(input.defaultFeeAccountId);
    if (input.defaultExpenseAccountId) accountIds.push(input.defaultExpenseAccountId);

    if (accountIds.length > 0) {
      const accounts = await tx
        .select({ id: glAccounts.id })
        .from(glAccounts)
        .where(
          and(
            eq(glAccounts.tenantId, ctx.tenantId),
            sql`${glAccounts.id} = ANY(${accountIds})`,
          ),
        );
      const foundIds = new Set(accounts.map((a) => a.id));
      for (const id of accountIds) {
        if (!foundIds.has(id)) {
          throw new NotFoundError('GL Account', id);
        }
      }
    }

    const tenderTypeId = generateUlid();
    const txnTypeId = generateUlid();

    // Create in tenant_tender_types
    const [tenderType] = await tx
      .insert(tenantTenderTypes)
      .values({
        id: tenderTypeId,
        tenantId: ctx.tenantId,
        name: input.name,
        code: input.code,
        category: input.category ?? 'other',
        postingMode: input.postingMode ?? 'clearing',
        requiresReference: input.requiresReference ?? false,
        referenceLabel: input.referenceLabel ?? null,
        defaultClearingAccountId: input.defaultClearingAccountId ?? null,
        defaultBankAccountId: input.defaultBankAccountId ?? null,
        defaultFeeAccountId: input.defaultFeeAccountId ?? null,
        defaultExpenseAccountId: input.defaultExpenseAccountId ?? null,
        reportingBucket: input.reportingBucket ?? 'include',
      })
      .returning();

    // Also create matching entry in gl_transaction_types (tenant-scoped)
    await tx
      .insert(glTransactionTypes)
      .values({
        id: txnTypeId,
        tenantId: ctx.tenantId,
        code: input.code,
        name: input.name,
        category: 'tender',
        description: `Custom tender: ${input.name}`,
        isSystem: false,
        isActive: true,
        defaultDebitAccountType: input.postingMode === 'non_cash' ? 'expense' : 'asset',
        defaultCreditAccountType: null,
        sortOrder: 9000, // custom types sort after system types
      });

    const event = buildEventFromContext(ctx, 'accounting.tender_type.created.v1', {
      tenderTypeId,
      code: input.code,
      name: input.name,
    });

    return { result: tenderType!, events: [event] };
  });

  await auditLog(ctx, 'accounting.tender_type.created', 'tenant_tender_types', result.id);

  return result;
}
