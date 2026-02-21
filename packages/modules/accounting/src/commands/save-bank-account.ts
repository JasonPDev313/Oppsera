import { eq, and, ne } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts, bankAccounts } from '@oppsera/db';
import { generateUlid, NotFoundError } from '@oppsera/shared';
import type { SaveBankAccountInput } from '../validation';

export async function saveBankAccount(
  ctx: RequestContext,
  input: SaveBankAccountInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Validate glAccountId exists
    const [glAccount] = await tx
      .select({ id: glAccounts.id })
      .from(glAccounts)
      .where(
        and(
          eq(glAccounts.tenantId, ctx.tenantId),
          eq(glAccounts.id, input.glAccountId),
        ),
      )
      .limit(1);

    if (!glAccount) {
      throw new NotFoundError('GL Account', input.glAccountId);
    }

    // 2. If isDefault, clear other defaults in same tenant
    if (input.isDefault) {
      await tx
        .update(bankAccounts)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(bankAccounts.tenantId, ctx.tenantId),
            eq(bankAccounts.isDefault, true),
            // Exclude current record if updating
            ...(input.id ? [ne(bankAccounts.id, input.id)] : []),
          ),
        );
    }

    let saved;
    const isUpdate = !!input.id;

    if (isUpdate) {
      // Update existing
      const [existing] = await tx
        .select()
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.id, input.id!),
            eq(bankAccounts.tenantId, ctx.tenantId),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new NotFoundError('Bank Account', input.id!);
      }

      [saved] = await tx
        .update(bankAccounts)
        .set({
          name: input.name,
          glAccountId: input.glAccountId,
          accountNumberLast4: input.accountNumberLast4 ?? null,
          bankName: input.bankName ?? null,
          isActive: input.isActive ?? true,
          isDefault: input.isDefault ?? false,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, input.id!))
        .returning();
    } else {
      // Create new
      [saved] = await tx
        .insert(bankAccounts)
        .values({
          id: generateUlid(),
          tenantId: ctx.tenantId,
          name: input.name,
          glAccountId: input.glAccountId,
          accountNumberLast4: input.accountNumberLast4 ?? null,
          bankName: input.bankName ?? null,
          isActive: input.isActive ?? true,
          isDefault: input.isDefault ?? false,
        })
        .returning();
    }

    const eventType = isUpdate
      ? 'accounting.bank_account.updated.v1'
      : 'accounting.bank_account.created.v1';

    const event = buildEventFromContext(ctx, eventType, {
      bankAccountId: saved!.id,
      name: input.name,
      glAccountId: input.glAccountId,
    });

    return { result: saved!, events: [event] };
  });

  const action = input.id ? 'accounting.bank_account.updated' : 'accounting.bank_account.created';
  await auditLog(ctx, action, 'bank_account', result.id);
  return result;
}
