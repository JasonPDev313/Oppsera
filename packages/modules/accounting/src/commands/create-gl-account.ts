import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts } from '@oppsera/db';
import { generateUlid, ConflictError } from '@oppsera/shared';
import { resolveNormalBalance } from '../helpers/resolve-normal-balance';
import type { CreateGlAccountInput } from '../validation';

export async function createGlAccount(
  ctx: RequestContext,
  input: CreateGlAccountInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate unique accountNumber per tenant
    const [existing] = await tx
      .select({ id: glAccounts.id })
      .from(glAccounts)
      .where(
        and(
          eq(glAccounts.tenantId, ctx.tenantId),
          eq(glAccounts.accountNumber, input.accountNumber),
        ),
      )
      .limit(1);

    if (existing) {
      throw new ConflictError(
        `Account number '${input.accountNumber}' already exists for this tenant`,
      );
    }

    const normalBalance = resolveNormalBalance(input.accountType);

    const [account] = await tx
      .insert(glAccounts)
      .values({
        id: generateUlid(),
        tenantId: ctx.tenantId,
        accountNumber: input.accountNumber,
        name: input.name,
        accountType: input.accountType,
        normalBalance,
        classificationId: input.classificationId ?? null,
        parentAccountId: input.parentAccountId ?? null,
        isControlAccount: input.isControlAccount ?? false,
        controlAccountType: input.controlAccountType ?? null,
        isContraAccount: input.isContraAccount ?? false,
        allowManualPosting: input.allowManualPosting ?? true,
        description: input.description ?? null,
      })
      .returning();

    const event = buildEventFromContext(ctx, 'accounting.account.created.v1', {
      accountId: account!.id,
      accountNumber: input.accountNumber,
      accountType: input.accountType,
      name: input.name,
    });

    return { result: account!, events: [event] };
  });

  await auditLog(ctx, 'accounting.account.created', 'gl_account', result.id);
  return result;
}
