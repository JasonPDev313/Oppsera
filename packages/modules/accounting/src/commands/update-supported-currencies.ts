import { eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { accountingSettings } from '@oppsera/db';
import { AppError, isValidCurrency } from '@oppsera/shared';
import type { UpdateSupportedCurrenciesInput } from '../validation';

/**
 * Update the list of supported currencies for a tenant.
 * The base currency is always included even if not explicitly listed.
 */
export async function updateSupportedCurrencies(
  ctx: RequestContext,
  input: UpdateSupportedCurrenciesInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load settings
    const [settings] = await tx
      .select({
        tenantId: accountingSettings.tenantId,
        baseCurrency: accountingSettings.baseCurrency,
      })
      .from(accountingSettings)
      .where(eq(accountingSettings.tenantId, ctx.tenantId))
      .limit(1);

    if (!settings) {
      throw new AppError('ACCOUNTING_NOT_CONFIGURED', 'Accounting settings not found — run bootstrap first', 404);
    }

    // 2. Validate all currency codes
    for (const code of input.currencies) {
      if (!isValidCurrency(code)) {
        throw new AppError('INVALID_CURRENCY', `"${code}" is not a recognized ISO 4217 currency code`, 400);
      }
    }

    // 3. Ensure base currency is always included
    const currencies = [...new Set([settings.baseCurrency, ...input.currencies])];

    // 4. Update settings
    const [updated] = await tx
      .update(accountingSettings)
      .set({
        supportedCurrencies: currencies,
        updatedAt: new Date(),
      })
      .where(eq(accountingSettings.tenantId, ctx.tenantId))
      .returning();

    const event = buildEventFromContext(ctx, 'accounting.supported_currencies.updated.v1', {
      currencies,
      baseCurrency: settings.baseCurrency,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'accounting.supported_currencies.updated', 'accounting_settings', ctx.tenantId);
  return result;
}
