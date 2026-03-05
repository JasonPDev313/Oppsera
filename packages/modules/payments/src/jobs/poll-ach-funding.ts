import { withTenant } from '@oppsera/db';
import {
  paymentProviders,
  paymentProviderCredentials,
  paymentMerchantAccounts,
  paymentIntents,
  paymentTransactions,
  paymentWebhookEvents,
} from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import type { RequestContext } from '@oppsera/core/auth/context';
import { providerRegistry } from '../providers/registry';
import { decryptCredentials } from '../helpers/credentials';
import type { FundingTransaction } from '../providers/interface';
import { processAchReturn } from '../commands/process-ach-return';
import { PAYMENT_GATEWAY_EVENTS, assertIntentTransition } from '../events/gateway-types';
import type { PaymentIntentStatus } from '../events/gateway-types';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';

export interface PollAchFundingInput {
  tenantId: string;
  /** Funding date in YYYY-MM-DD format. Defaults to yesterday. */
  date?: string;
  /** Number of lookback days for catch-up polling (weekends/holidays). Default: 1 */
  lookbackDays?: number;
}

export interface PollAchFundingResult {
  merchantId: string;
  date: string;
  totalTransactions: number;
  settledCount: number;
  originatedCount: number;
  returnedCount: number;
  skippedCount: number;
}

/**
 * Poll ACH funding status from the payment provider.
 *
 * Flow per MID:
 * 1. Call provider.getFundingStatus(date, merchantId)
 * 2. Match each transaction to our payment_intents by providerRef
 * 3. For returned transactions → call processAchReturn()
 * 4. For settled transactions → update ach_settlement_status + emit event
 * 5. For originated transactions → update ach_settlement_status + emit event
 *
 * Idempotent: tracks processed funding batches via paymentWebhookEvents table.
 * Supports catch-up polling for weekends/holidays.
 *
 * Designed to be called daily at 6 AM ET (after bank processing) or manually by admin.
 */
export async function pollAchFunding(
  ctx: RequestContext,
  input: PollAchFundingInput,
): Promise<PollAchFundingResult[]> {
  const { tenantId } = input;
  const lookbackDays = input.lookbackDays ?? 1;

  // Build date list (lookback support for weekends/holidays)
  const dates = buildDateList(input.date, lookbackDays);
  const results: PollAchFundingResult[] = [];

  // Phase 1: Read-only setup queries in a single withTenant transaction.
  // This avoids nesting publishWithOutbox inside withTenant, which would
  // cause nested transactions / pool exhaustion (max: 2 on Vercel).
  const setup = await withTenant(tenantId, async (tx) => {
    // 1. Find active provider
    const [providerRow] = await tx
      .select()
      .from(paymentProviders)
      .where(
        and(
          eq(paymentProviders.tenantId, tenantId),
          eq(paymentProviders.isActive, true),
        ),
      )
      .limit(1);

    if (!providerRow) return null;

    // 2. Resolve credentials (tenant-wide)
    const [credsRow] = await tx
      .select({ credentialsEncrypted: paymentProviderCredentials.credentialsEncrypted })
      .from(paymentProviderCredentials)
      .where(
        and(
          eq(paymentProviderCredentials.tenantId, tenantId),
          eq(paymentProviderCredentials.providerId, providerRow.id),
          isNull(paymentProviderCredentials.locationId),
          eq(paymentProviderCredentials.isActive, true),
        ),
      )
      .limit(1);

    if (!credsRow) return null;

    const credentials = decryptCredentials(credsRow.credentialsEncrypted);

    // 3. Get all ACH-enabled merchant accounts
    const merchantAccounts = await tx
      .select({
        id: paymentMerchantAccounts.id,
        merchantId: paymentMerchantAccounts.merchantId,
        locationId: paymentMerchantAccounts.locationId,
        displayName: paymentMerchantAccounts.displayName,
      })
      .from(paymentMerchantAccounts)
      .where(
        and(
          eq(paymentMerchantAccounts.tenantId, tenantId),
          eq(paymentMerchantAccounts.providerId, providerRow.id),
          eq(paymentMerchantAccounts.isActive, true),
          eq(paymentMerchantAccounts.achEnabled, true),
        ),
      );

    if (merchantAccounts.length === 0) return null;

    return { providerRow, credentials, merchantAccounts };
  });

  if (!setup) return results;

  const { providerRow, credentials, merchantAccounts } = setup;

  // Phase 2: Process each MID/date outside the outer transaction.
  // Each processFundingTransaction call now has its own independent
  // publishWithOutbox transaction, preventing nested tx / pool exhaustion.
  for (const ma of merchantAccounts) {
    const provider = providerRegistry.get(providerRow.code, credentials, ma.merchantId);

    if (!provider.getFundingStatus) {
      console.warn(`[ACH Funding] Provider ${providerRow.code} does not support getFundingStatus`);
      continue;
    }

    for (const fundingDate of dates) {
      try {
        const fundingData = await provider.getFundingStatus(fundingDate, ma.merchantId);

        // Idempotency: check if we already processed this batch
        const batchKey = `ach-funding-${ma.merchantId}-${fundingDate}`;
        const existingBatch = await withTenant(tenantId, async (tx) => {
          const [existing] = await tx
            .select({ id: paymentWebhookEvents.id })
            .from(paymentWebhookEvents)
            .where(
              and(
                eq(paymentWebhookEvents.tenantId, tenantId),
                eq(paymentWebhookEvents.providerCode, providerRow.code),
                eq(paymentWebhookEvents.eventId, batchKey),
              ),
            )
            .limit(1);
          return existing;
        });

        if (existingBatch) {
          continue;
        }

        // Process each funding transaction independently
        let settledCount = 0;
        let originatedCount = 0;
        let returnedCount = 0;
        let skippedCount = 0;

        for (const ftxn of fundingData.fundingTransactions) {
          try {
            const processed = await processFundingTransaction(
              ctx,
              tenantId,
              ma.id,
              ftxn,
              fundingDate,
            );
            switch (processed) {
              case 'settled':
                settledCount++;
                break;
              case 'originated':
                originatedCount++;
                break;
              case 'returned':
                returnedCount++;
                break;
              case 'skipped':
                skippedCount++;
                break;
            }
          } catch (err) {
            console.error(
              `[ACH Funding] Failed to process transaction ${ftxn.providerRef}:`,
              err,
            );
            skippedCount++;
          }
        }

        // Mark this batch as processed (its own transaction)
        await withTenant(tenantId, async (tx) => {
          await tx.insert(paymentWebhookEvents).values({
            id: generateUlid(),
            tenantId,
            providerCode: providerRow.code,
            eventId: batchKey,
            eventType: 'ach_funding_poll',
            processedAt: new Date(),
            payload: fundingData.rawResponse,
          });
        });

        results.push({
          merchantId: ma.merchantId,
          date: fundingDate,
          totalTransactions: fundingData.fundingTransactions.length,
          settledCount,
          originatedCount,
          returnedCount,
          skippedCount,
        });
      } catch (err) {
        // Best-effort: log and continue to next date/MID
        console.error(
          `[ACH Funding] Failed to poll MID ${ma.merchantId} for ${fundingDate}:`,
          err,
        );
      }
    }
  }

  return results;
}

// ── Transaction Processing ─────────────────────────────────────

type ProcessResult = 'settled' | 'originated' | 'returned' | 'skipped';

async function processFundingTransaction(
  ctx: RequestContext,
  tenantId: string,
  merchantAccountId: string,
  ftxn: FundingTransaction,
  fundingDate: string,
): Promise<ProcessResult> {
  // Look up the payment intent by providerRef — read-only query in its own transaction
  const intentData = await withTenant(tenantId, async (tx) => {
    const matchRows = await tx
      .select({
        intentId: paymentTransactions.paymentIntentId,
      })
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.tenantId, tenantId),
          eq(paymentTransactions.providerRef, ftxn.providerRef),
        ),
      )
      .limit(1);

    if (matchRows.length === 0) return null;

    const intentId = matchRows[0]!.intentId;

    const [intent] = await tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.id, intentId),
          eq(paymentIntents.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!intent || intent.paymentMethodType !== 'ach') return null;

    return { intentId, intent };
  });

  if (!intentData) return 'skipped';

  const { intentId, intent } = intentData;
  const currentStatus = intent.status as PaymentIntentStatus;

  switch (ftxn.fundingStatus) {
    case 'returned':
    case 'rejected': {
      if (!ftxn.achReturnCode) {
        console.warn(`[ACH Funding] Return without code for ${ftxn.providerRef}`);
        return 'skipped';
      }
      // processAchReturn uses its own publishWithOutbox — safe outside any outer tx
      await processAchReturn(ctx, {
        paymentIntentId: intentId,
        returnCode: ftxn.achReturnCode,
        returnReason: ftxn.achReturnDescription ?? undefined,
        returnDate: fundingDate,
        providerRef: ftxn.providerRef,
        fundingBatchId: ftxn.batchId ?? undefined,
      });
      return 'returned';
    }

    case 'settled': {
      if (currentStatus === 'ach_settled' || currentStatus === 'ach_returned') {
        return 'skipped';
      }

      try {
        assertIntentTransition(currentStatus, 'ach_settled');
      } catch {
        return 'skipped';
      }

      await publishWithOutbox(ctx, async (innerTx) => {
        await innerTx
          .update(paymentIntents)
          .set({
            status: 'ach_settled',
            achSettlementStatus: 'settled',
            achSettledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(paymentIntents.id, intentId));

        const event = buildEventFromContext(ctx, PAYMENT_GATEWAY_EVENTS.ACH_SETTLED, {
          paymentIntentId: intentId,
          tenantId,
          locationId: intent.locationId,
          merchantAccountId,
          amountCents: intent.amountCents,
          settledAt: new Date().toISOString(),
          fundingDate,
          providerRef: ftxn.providerRef,
        });

        return { result: null, events: [event] };
      });

      await auditLog(ctx, 'payment.ach.settled', 'payment_intent', intentId);
      return 'settled';
    }

    case 'originated': {
      if (currentStatus !== 'ach_pending') {
        return 'skipped';
      }

      try {
        assertIntentTransition(currentStatus, 'ach_originated');
      } catch {
        return 'skipped';
      }

      await publishWithOutbox(ctx, async (innerTx) => {
        await innerTx
          .update(paymentIntents)
          .set({
            status: 'ach_originated',
            achSettlementStatus: 'originated',
            updatedAt: new Date(),
          })
          .where(eq(paymentIntents.id, intentId));

        const event = buildEventFromContext(ctx, PAYMENT_GATEWAY_EVENTS.ACH_ORIGINATED, {
          paymentIntentId: intentId,
          tenantId,
          locationId: intent.locationId,
          merchantAccountId,
          amountCents: intent.amountCents,
          currency: intent.currency,
          orderId: intent.orderId ?? null,
          customerId: intent.customerId ?? null,
          providerRef: ftxn.providerRef,
          achSecCode: intent.achSecCode ?? 'WEB',
          achAccountType: intent.achAccountType ?? 'ECHK',
          bankLast4: intent.bankLast4 ?? null,
        });

        return { result: null, events: [event] };
      });

      await auditLog(ctx, 'payment.ach.originated', 'payment_intent', intentId);
      return 'originated';
    }

    default:
      return 'skipped';
  }
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Build a list of dates to poll (lookback support for weekends/holidays).
 * Default: yesterday only. With lookbackDays=3: yesterday, day before, etc.
 */
function buildDateList(date: string | undefined, lookbackDays: number): string[] {
  if (date) return [date]; // Specific date override

  const dates: string[] = [];
  const now = new Date();

  for (let i = 1; i <= lookbackDays; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dates.push(iso);
  }

  return dates;
}
