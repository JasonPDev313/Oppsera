import { eq, and } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';
import { periodicCogsCalculations, accountingSettings } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import { getAccountingPostingApi } from '@oppsera/core/helpers/accounting-posting-api';
import { resolveSubDepartmentAccounts } from '../helpers/resolve-mapping';
import type { RequestContext } from '@oppsera/core/auth/context';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { PostPeriodicCogsInput } from '../validation';

/**
 * Post a periodic COGS calculation to GL.
 *
 * GL Entry:
 *   DEBIT:  COGS Expense (per sub-department when mapped)
 *   CREDIT: Inventory Asset (per sub-department when mapped)
 *
 * Falls back to a single entry using the first available COGS/Inventory mapping.
 */
export async function postPeriodicCogs(
  ctx: RequestContext,
  input: PostPeriodicCogsInput,
): Promise<{ id: string; glJournalEntryId: string }> {
  return withTenant(ctx.tenantId, async (tx) => {
    // Load calculation
    const [calc] = await tx
      .select()
      .from(periodicCogsCalculations)
      .where(
        and(
          eq(periodicCogsCalculations.tenantId, ctx.tenantId),
          eq(periodicCogsCalculations.id, input.calculationId),
        ),
      )
      .limit(1);

    if (!calc) {
      throw new AppError('NOT_FOUND', 'Periodic COGS calculation not found', 404);
    }

    if (calc.status === 'posted') {
      throw new AppError('VALIDATION_ERROR', 'Calculation already posted', 409);
    }

    const cogsDollars = Number(calc.cogsDollars);
    if (cogsDollars <= 0) {
      throw new AppError('VALIDATION_ERROR', 'COGS amount must be positive to post', 400);
    }

    // Load settings for any default account resolution
    const [settings] = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.tenantId, ctx.tenantId))
      .limit(1);

    if (!settings) {
      throw new AppError('VALIDATION_ERROR', 'Accounting settings not configured', 400);
    }

    // Build GL lines — use sub-department detail if available, otherwise aggregate
    const detail = calc.detail as Array<{
      subDepartmentId: string;
      cogsDollars: string;
    }> | null;

    const glLines: Array<{
      accountId: string;
      debitAmount: string;
      creditAmount: string;
      locationId?: string;
      subDepartmentId?: string;
      memo?: string;
    }> = [];

    if (detail && detail.length > 0) {
      // Per sub-department posting
      for (const d of detail) {
        const mapping = await resolveSubDepartmentAccounts(tx, ctx.tenantId, d.subDepartmentId);
        if (!mapping?.cogsAccountId || !mapping?.inventoryAccountId) continue;

        const amount = Number(d.cogsDollars).toFixed(2);
        if (Number(amount) <= 0) continue;

        glLines.push({
          accountId: mapping.cogsAccountId,
          debitAmount: amount,
          creditAmount: '0',
          locationId: calc.locationId ?? undefined,
          subDepartmentId: d.subDepartmentId,
          memo: `Periodic COGS - ${calc.periodStart} to ${calc.periodEnd}`,
        });
        glLines.push({
          accountId: mapping.inventoryAccountId,
          debitAmount: '0',
          creditAmount: amount,
          locationId: calc.locationId ?? undefined,
          subDepartmentId: d.subDepartmentId,
          memo: `Periodic COGS - ${calc.periodStart} to ${calc.periodEnd}`,
        });
      }
    }

    // If no per-subdept lines built (no detail or no mappings), post as aggregate
    if (glLines.length === 0) {
      // Find any COGS + Inventory mapping to use
      const { sql } = await import('drizzle-orm');
      const mappingRows = await tx.execute(sql`
        SELECT cogs_account_id, inventory_account_id
        FROM sub_department_gl_defaults
        WHERE tenant_id = ${ctx.tenantId}
          AND cogs_account_id IS NOT NULL
          AND inventory_account_id IS NOT NULL
        LIMIT 1
      `);
      const mappingArr = Array.from(mappingRows as Iterable<Record<string, unknown>>);
      const anyMapping = mappingArr[0] as { cogs_account_id: string; inventory_account_id: string } | undefined;

      if (!anyMapping) {
        throw new AppError(
          'VALIDATION_ERROR',
          'No COGS and Inventory GL account mappings found. Configure sub-department GL mappings first.',
          400,
        );
      }

      const amount = cogsDollars.toFixed(2);
      glLines.push({
        accountId: anyMapping.cogs_account_id,
        debitAmount: amount,
        creditAmount: '0',
        locationId: calc.locationId ?? undefined,
        memo: `Periodic COGS - ${calc.periodStart} to ${calc.periodEnd}`,
      });
      glLines.push({
        accountId: anyMapping.inventory_account_id,
        debitAmount: '0',
        creditAmount: amount,
        locationId: calc.locationId ?? undefined,
        memo: `Periodic COGS - ${calc.periodStart} to ${calc.periodEnd}`,
      });
    }

    // Post GL entry
    const accountingApi = getAccountingPostingApi();
    const entry = await accountingApi.postEntry(ctx, {
      businessDate: calc.periodEnd,
      sourceModule: 'periodic_cogs',
      sourceReferenceId: calc.id,
      memo: `Periodic COGS: ${calc.periodStart} to ${calc.periodEnd}`,
      currency: 'USD',
      lines: glLines,
      forcePost: true,
    });

    // Mark calculation as posted
    await tx
      .update(periodicCogsCalculations)
      .set({
        status: 'posted',
        glJournalEntryId: entry.id,
        postedAt: new Date(),
        postedBy: ctx.user.id,
        updatedAt: new Date(),
      })
      .where(eq(periodicCogsCalculations.id, calc.id));

    // Update last calculated date in settings
    await tx
      .update(accountingSettings)
      .set({
        periodicCogsLastCalculatedDate: calc.periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(accountingSettings.tenantId, ctx.tenantId));

    await auditLog(ctx, 'accounting.cogs.posted', 'periodic_cogs_calculation', calc.id, undefined, {
      amountDollars: cogsDollars.toFixed(2),
      periodStart: calc.periodStart,
      periodEnd: calc.periodEnd,
      glJournalEntryId: entry.id,
    });

    return { id: calc.id, glJournalEntryId: entry.id };
  });
}
