import { eq, and, sql } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { glAccounts, glJournalEntries, glJournalLines } from '@oppsera/db';
import { NotFoundError, ConflictError, AppError } from '@oppsera/shared';
import { resolveNormalBalance } from '../helpers/resolve-normal-balance';
import type { UpdateGlAccountInput } from '../validation';

export async function updateGlAccount(
  ctx: RequestContext,
  accountId: string,
  input: UpdateGlAccountInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load existing account
    const [existing] = await tx
      .select()
      .from(glAccounts)
      .where(
        and(
          eq(glAccounts.id, accountId),
          eq(glAccounts.tenantId, ctx.tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundError('GL Account', accountId);
    }

    // 2. Block accountType change if account has posted journal lines
    if (input.accountType !== undefined && input.accountType !== existing.accountType) {
      const posted = await tx.execute(sql`
        SELECT 1 FROM gl_journal_lines jl
        JOIN gl_journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.account_id = ${accountId}
          AND je.status = 'posted'
        LIMIT 1
      `);

      if (Array.from(posted as Iterable<unknown>).length > 0) {
        throw new AppError(
          'ACCOUNT_TYPE_CHANGE_BLOCKED',
          'Cannot change account type on an account with posted journal lines',
          409,
        );
      }
    }

    // 3. Validate unique accountNumber if changing
    if (input.accountNumber !== undefined && input.accountNumber !== existing.accountNumber) {
      const [dupe] = await tx
        .select({ id: glAccounts.id })
        .from(glAccounts)
        .where(
          and(
            eq(glAccounts.tenantId, ctx.tenantId),
            eq(glAccounts.accountNumber, input.accountNumber),
          ),
        )
        .limit(1);

      if (dupe) {
        throw new ConflictError(
          `Account number '${input.accountNumber}' already exists for this tenant`,
        );
      }
    }

    // 4. Build update values
    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updateValues[key] = value;
      }
    }

    // Recalculate normalBalance if accountType is changing
    if (input.accountType !== undefined) {
      updateValues.normalBalance = resolveNormalBalance(input.accountType);
    }

    const [updated] = await tx
      .update(glAccounts)
      .set(updateValues)
      .where(eq(glAccounts.id, accountId))
      .returning();

    const event = buildEventFromContext(ctx, 'accounting.account.updated.v1', {
      accountId,
      changes: Object.keys(input).filter((k) => (input as Record<string, unknown>)[k] !== undefined),
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'accounting.account.updated', 'gl_account', result.id);
  return result;
}
