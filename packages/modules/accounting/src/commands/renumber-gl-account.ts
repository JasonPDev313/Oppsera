import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts } from '@oppsera/db';
import { NotFoundError, ConflictError } from '@oppsera/shared';
import { computePath, getDescendants } from '../services/hierarchy-helpers';
import { logAccountChange } from '../services/account-change-log';
import type { RenumberGlAccountInput } from '../validation';

export async function renumberGlAccount(
  ctx: RequestContext,
  accountId: string,
  input: RenumberGlAccountInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load account
    const [existing] = await tx
      .select()
      .from(glAccounts)
      .where(and(eq(glAccounts.id, accountId), eq(glAccounts.tenantId, ctx.tenantId)))
      .limit(1);

    if (!existing) throw new NotFoundError('GL Account', accountId);

    if (existing.accountNumber === input.newAccountNumber) {
      return { result: existing, events: [] };
    }

    // Validate unique
    const [dupe] = await tx
      .select({ id: glAccounts.id })
      .from(glAccounts)
      .where(and(
        eq(glAccounts.tenantId, ctx.tenantId),
        eq(glAccounts.accountNumber, input.newAccountNumber),
      ))
      .limit(1);

    if (dupe) {
      throw new ConflictError(`Account number '${input.newAccountNumber}' already exists`);
    }

    const oldNumber = existing.accountNumber;

    // Update account number
    const [updated] = await tx
      .update(glAccounts)
      .set({
        accountNumber: input.newAccountNumber,
        updatedAt: new Date(),
      })
      .where(eq(glAccounts.id, accountId))
      .returning();

    // Recompute path for this account + all descendants
    const allAccounts = await tx
      .select({ id: glAccounts.id, accountNumber: glAccounts.accountNumber, parentAccountId: glAccounts.parentAccountId })
      .from(glAccounts)
      .where(eq(glAccounts.tenantId, ctx.tenantId));

    const descendants = getDescendants(accountId, allAccounts);
    for (const acct of [{ id: accountId, accountNumber: input.newAccountNumber, parentAccountId: existing.parentAccountId }, ...descendants]) {
      const path = computePath(acct.id, allAccounts);
      await tx
        .update(glAccounts)
        .set({ path })
        .where(eq(glAccounts.id, acct.id));
    }

    // Log change
    await logAccountChange(tx, {
      tenantId: ctx.tenantId,
      accountId,
      action: 'RENUMBER',
      changes: [{ field: 'accountNumber', oldValue: oldNumber, newValue: input.newAccountNumber }],
      changedBy: ctx.user.id,
    });

    const event = buildEventFromContext(ctx, 'accounting.account.renumbered.v1', {
      accountId,
      oldAccountNumber: oldNumber,
      newAccountNumber: input.newAccountNumber,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'accounting.account.renumbered', 'gl_account', accountId);
  return result;
}
