import { eq, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import { validateMerge } from '../services/coa-validation';
import type { GLAccountForValidation } from '../services/coa-validation';
import { getDescendants, computeDepth, computePath } from '../services/hierarchy-helpers';
import { logAccountChange } from '../services/account-change-log';
import type { MergeGlAccountsInput } from '../validation';

export async function mergeGlAccounts(
  ctx: RequestContext,
  input: MergeGlAccountsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Load both accounts
    const allAccounts = await tx
      .select()
      .from(glAccounts)
      .where(eq(glAccounts.tenantId, ctx.tenantId));

    const source = allAccounts.find((a) => a.id === input.sourceAccountId);
    const target = allAccounts.find((a) => a.id === input.targetAccountId);

    if (!source) throw new NotFoundError('Source GL Account', input.sourceAccountId);
    if (!target) throw new NotFoundError('Target GL Account', input.targetAccountId);

    // Validate merge
    const errors = validateMerge(
      source as unknown as GLAccountForValidation,
      target as unknown as GLAccountForValidation,
    );
    if (errors.length > 0) {
      throw new AppError(
        'MERGE_VALIDATION_FAILED',
        errors.map((e) => e.message).join('; '),
        422,
      );
    }

    // 1. Reparent children of source → target
    const sourceChildren = allAccounts.filter((a) => a.parentAccountId === source.id);
    for (const child of sourceChildren) {
      await tx
        .update(glAccounts)
        .set({ parentAccountId: target.id })
        .where(eq(glAccounts.id, child.id));
    }

    // 2. Reassign journal lines from source → target
    await tx.execute(sql`
      UPDATE gl_journal_lines
      SET account_id = ${target.id}
      WHERE account_id = ${source.id}
    `);

    // 3. Mark source as merged
    await tx
      .update(glAccounts)
      .set({
        status: 'pending_merge',
        mergedIntoId: target.id,
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(glAccounts.id, source.id));

    // 4. Recompute hierarchy for target's subtree
    const updatedAccounts = await tx
      .select({ id: glAccounts.id, accountNumber: glAccounts.accountNumber, parentAccountId: glAccounts.parentAccountId })
      .from(glAccounts)
      .where(eq(glAccounts.tenantId, ctx.tenantId));

    const targetDescendants = getDescendants(target.id, updatedAccounts);
    for (const desc of [{ id: target.id, accountNumber: target.accountNumber, parentAccountId: target.parentAccountId }, ...targetDescendants]) {
      const depth = computeDepth(desc.id, updatedAccounts);
      const path = computePath(desc.id, updatedAccounts);
      await tx
        .update(glAccounts)
        .set({ depth, path })
        .where(eq(glAccounts.id, desc.id));
    }

    // 5. Log merge for both accounts
    await logAccountChange(tx, {
      tenantId: ctx.tenantId,
      accountId: source.id,
      action: 'MERGE',
      changes: [
        { field: 'status', oldValue: 'active', newValue: 'pending_merge' },
        { field: 'mergedIntoId', oldValue: null, newValue: target.id },
      ],
      changedBy: ctx.user.id,
      metadata: { mergedInto: target.accountNumber, targetName: target.name },
    });

    await logAccountChange(tx, {
      tenantId: ctx.tenantId,
      accountId: target.id,
      action: 'MERGE',
      changes: [
        { field: 'mergedFrom', oldValue: null, newValue: source.accountNumber },
      ],
      changedBy: ctx.user.id,
      metadata: { mergedFrom: source.accountNumber, sourceName: source.name, reparentedChildren: sourceChildren.length },
    });

    const event = buildEventFromContext(ctx, 'accounting.account.merged.v1', {
      sourceAccountId: source.id,
      targetAccountId: target.id,
      reparentedChildren: sourceChildren.length,
    });

    return {
      result: {
        sourceAccountId: source.id,
        targetAccountId: target.id,
        reparentedChildren: sourceChildren.length,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'accounting.account.merged', 'gl_account', input.sourceAccountId);
  return result;
}
