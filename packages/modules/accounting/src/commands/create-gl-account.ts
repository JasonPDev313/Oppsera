import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts } from '@oppsera/db';
import { generateUlid, ConflictError } from '@oppsera/shared';
import { resolveNormalBalance } from '../helpers/resolve-normal-balance';
import { computeDepth, computePath } from '../services/hierarchy-helpers';
import { logAccountChange } from '../services/account-change-log';
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

    // Compute hierarchy fields if parent is set
    let depth = 0;
    let path = input.accountNumber;
    if (input.parentAccountId) {
      const allAccounts = await tx
        .select({ id: glAccounts.id, accountNumber: glAccounts.accountNumber, parentAccountId: glAccounts.parentAccountId })
        .from(glAccounts)
        .where(eq(glAccounts.tenantId, ctx.tenantId));

      const tempId = '__new__';
      const withNew = [...allAccounts, { id: tempId, accountNumber: input.accountNumber, parentAccountId: input.parentAccountId }];
      depth = computeDepth(tempId, withNew);
      path = computePath(tempId, withNew);
    }

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
        depth,
        path,
      })
      .returning();

    // Log creation
    await logAccountChange(tx, {
      tenantId: ctx.tenantId,
      accountId: account!.id,
      action: 'CREATE',
      changes: [],
      changedBy: ctx.user.id,
    });

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
