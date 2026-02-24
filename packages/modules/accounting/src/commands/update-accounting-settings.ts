import { eq, and, inArray } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { accountingSettings, glAccounts } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import type { UpdateAccountingSettingsInput } from '../validation';

export async function updateAccountingSettings(
  ctx: RequestContext,
  input: UpdateAccountingSettingsInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Validate referenced account IDs exist
    const accountIdFields = [
      'defaultAPControlAccountId',
      'defaultARControlAccountId',
      'defaultSalesTaxPayableAccountId',
      'defaultUndepositedFundsAccountId',
      'defaultRetainedEarningsAccountId',
      'defaultRoundingAccountId',
      'defaultTipsPayableAccountId',
      'defaultServiceChargeRevenueAccountId',
      'breakageIncomeAccountId',
      'defaultUncategorizedRevenueAccountId',
    ] as const;

    const accountIdsToCheck: string[] = [];
    for (const field of accountIdFields) {
      const value = input[field];
      if (value !== undefined && value !== null) {
        accountIdsToCheck.push(value);
      }
    }

    if (accountIdsToCheck.length > 0) {
      const accounts = await tx
        .select({ id: glAccounts.id })
        .from(glAccounts)
        .where(
          and(
            eq(glAccounts.tenantId, ctx.tenantId),
            inArray(glAccounts.id, accountIdsToCheck),
          ),
        );

      const foundIds = new Set(accounts.map((a) => a.id));
      for (const id of accountIdsToCheck) {
        if (!foundIds.has(id)) {
          throw new NotFoundError('GL Account', id);
        }
      }
    }

    // UPSERT settings
    const existing = await tx
      .select()
      .from(accountingSettings)
      .where(eq(accountingSettings.tenantId, ctx.tenantId))
      .limit(1);

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updateValues[key] = value;
      }
    }

    let settings;
    if (existing.length > 0) {
      [settings] = await tx
        .update(accountingSettings)
        .set(updateValues)
        .where(eq(accountingSettings.tenantId, ctx.tenantId))
        .returning();
    } else {
      [settings] = await tx
        .insert(accountingSettings)
        .values({
          tenantId: ctx.tenantId,
          ...updateValues,
        })
        .returning();
    }

    return { result: settings!, events: [] };
  });

  await auditLog(ctx, 'accounting.settings.updated', 'accounting_settings', ctx.tenantId);
  return result;
}
