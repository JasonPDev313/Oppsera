import { eq } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { currencyExchangeRates, accountingSettings } from '@oppsera/db';
import { generateUlid, AppError } from '@oppsera/shared';
import type { UpdateExchangeRateInput } from '../validation';

/**
 * Upsert an exchange rate for a currency pair on a given date.
 * Validates that both currencies are in the tenant's supportedCurrencies list.
 */
export async function updateExchangeRate(
  ctx: RequestContext,
  input: UpdateExchangeRateInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load settings to validate currencies
    const [settings] = await tx
      .select({
        supportedCurrencies: accountingSettings.supportedCurrencies,
        baseCurrency: accountingSettings.baseCurrency,
      })
      .from(accountingSettings)
      .where(eq(accountingSettings.tenantId, ctx.tenantId))
      .limit(1);

    if (!settings) {
      throw new AppError('ACCOUNTING_NOT_CONFIGURED', 'Accounting settings not found — run bootstrap first', 404);
    }

    const supported = settings.supportedCurrencies ?? ['USD'];
    if (!supported.includes(input.fromCurrency)) {
      throw new AppError('UNSUPPORTED_CURRENCY', `Currency "${input.fromCurrency}" is not in supported currencies`, 400);
    }
    if (!supported.includes(input.toCurrency)) {
      throw new AppError('UNSUPPORTED_CURRENCY', `Currency "${input.toCurrency}" is not in supported currencies`, 400);
    }
    if (input.fromCurrency === input.toCurrency) {
      throw new AppError('VALIDATION_ERROR', 'fromCurrency and toCurrency must be different', 400);
    }

    // 2. Upsert the rate (ON CONFLICT update)
    const id = generateUlid();
    const [saved] = await tx
      .insert(currencyExchangeRates)
      .values({
        id,
        tenantId: ctx.tenantId,
        fromCurrency: input.fromCurrency,
        toCurrency: input.toCurrency,
        rate: input.rate.toString(),
        effectiveDate: input.effectiveDate,
        source: input.source ?? 'manual',
        createdBy: ctx.user.id,
      })
      .onConflictDoUpdate({
        target: [
          currencyExchangeRates.tenantId,
          currencyExchangeRates.fromCurrency,
          currencyExchangeRates.toCurrency,
          currencyExchangeRates.effectiveDate,
        ],
        set: {
          rate: input.rate.toString(),
          source: input.source ?? 'manual',
          createdBy: ctx.user.id,
        },
      })
      .returning();

    const event = buildEventFromContext(ctx, 'accounting.exchange_rate.updated.v1', {
      exchangeRateId: saved!.id,
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      rate: input.rate,
      effectiveDate: input.effectiveDate,
    });

    return { result: saved!, events: [event] };
  });

  await auditLog(ctx, 'accounting.exchange_rate.updated', 'exchange_rate', result.id);
  return result;
}
