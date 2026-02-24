import { withTenant } from '@oppsera/db';
import {
  paymentProviders,
  paymentProviderCredentials,
  paymentMerchantAccounts,
  paymentSettlements,
  paymentTransactions,
  paymentSettlementLines,
} from '@oppsera/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { generateUlid } from '@oppsera/shared';
import { providerRegistry } from '../providers/registry';
import { decryptCredentials } from '../helpers/credentials';
import type { SettlementTransaction } from '../providers/interface';

export interface FetchSettlementInput {
  tenantId: string;
  locationId?: string;
  /** Settlement date in MMDD format (CardPointe) or YYYY-MM-DD format. Defaults to yesterday. */
  date?: string;
}

export interface FetchSettlementResult {
  settlementId: string;
  merchantId: string;
  date: string;
  totalTransactions: number;
  matchedCount: number;
  unmatchedCount: number;
  grossAmountDollars: string;
}

/**
 * Fetch daily settlement data from the payment provider and match to our tenders.
 *
 * Flow:
 * 1. Resolve provider + credentials + merchant accounts for tenant
 * 2. Call provider.getSettlementStatus() for each active MID
 * 3. Create/update payment_settlement record
 * 4. Match each provider transaction to our payment_transactions by providerRef
 * 5. Create payment_settlement_line for each (matched or unmatched)
 *
 * Designed to be called by a daily cron job or manually by admin.
 */
export async function fetchDailySettlements(
  input: FetchSettlementInput,
): Promise<FetchSettlementResult[]> {
  const { tenantId } = input;

  // Default to yesterday's date
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const defaultDate = `${String(yesterday.getMonth() + 1).padStart(2, '0')}${String(yesterday.getDate()).padStart(2, '0')}`;
  const settleDate = input.date ?? defaultDate;

  // ISO date for storage (YYYY-MM-DD)
  const isoDate = toIsoDate(settleDate, yesterday);

  const results: FetchSettlementResult[] = [];

  await withTenant(tenantId, async (tx) => {
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

    if (!providerRow) return;

    // 2. Resolve credentials (tenant-wide for settlement jobs)
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

    if (!credsRow) return;

    const credentials = decryptCredentials(credsRow.credentialsEncrypted);

    // 3. Get all active merchant accounts for this tenant
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
        ),
      );

    if (merchantAccounts.length === 0) return;

    // 4. Fetch settlement data from provider for each MID
    for (const ma of merchantAccounts) {
      // Skip if filtering by location and this MID isn't for that location
      if (input.locationId && ma.locationId && ma.locationId !== input.locationId) continue;

      try {
        const provider = providerRegistry.get(providerRow.code, credentials, ma.merchantId);
        const settlementData = await provider.getSettlementStatus(settleDate, ma.merchantId);

        // 5. Check for existing settlement (idempotent)
        const batchId = (settlementData.rawResponse as Record<string, unknown>).batchid as string
          ?? `${ma.merchantId}-${isoDate}`;

        const existing = await tx
          .select({ id: paymentSettlements.id })
          .from(paymentSettlements)
          .where(
            and(
              eq(paymentSettlements.tenantId, tenantId),
              eq(paymentSettlements.processorName, providerRow.code),
              eq(paymentSettlements.processorBatchId, batchId),
            ),
          )
          .limit(1);

        if (existing.length > 0) {
          // Already processed — skip
          continue;
        }

        // 6. Calculate totals from settlement transactions
        const grossCents = settlementData.transactions.reduce(
          (sum, txn) => sum + Math.round(parseFloat(txn.amount) * 100),
          0,
        );
        const grossDollars = (grossCents / 100).toFixed(2);

        // 7. Match transactions and create settlement record
        const { matchedCount, unmatchedCount, lines } = await matchTransactions(
          tx,
          tenantId,
          settlementData.transactions,
        );

        // Estimate fees (actual fees come from funding API or settlement CSV)
        // For now, fee tracking is per-line from matching; total is summed
        const totalFeeCents = lines.reduce((sum, l) => sum + l.feeCents, 0);
        const feeDollars = (totalFeeCents / 100).toFixed(2);
        const netDollars = ((grossCents - totalFeeCents) / 100).toFixed(2);

        // 8. Create settlement record
        const settlementId = generateUlid();
        await tx.insert(paymentSettlements).values({
          id: settlementId,
          tenantId,
          locationId: ma.locationId ?? null,
          settlementDate: isoDate,
          processorName: providerRow.code,
          processorBatchId: batchId,
          grossAmount: grossDollars,
          feeAmount: feeDollars,
          netAmount: netDollars,
          chargebackAmount: '0.00',
          status: unmatchedCount > 0 ? 'pending' : 'matched',
          bankAccountId: null,
          importSource: 'webhook',
          businessDateFrom: isoDate,
          businessDateTo: isoDate,
          rawData: settlementData.rawResponse,
        });

        // 9. Create settlement lines
        for (const line of lines) {
          await tx.insert(paymentSettlementLines).values({
            id: generateUlid(),
            tenantId,
            settlementId,
            tenderId: line.tenderId,
            originalAmountCents: line.originalAmountCents,
            settledAmountCents: line.settledAmountCents,
            feeCents: line.feeCents,
            netCents: line.settledAmountCents - line.feeCents,
            status: line.tenderId ? 'matched' : 'unmatched',
            matchedAt: line.tenderId ? new Date() : null,
          });
        }

        results.push({
          settlementId,
          merchantId: ma.merchantId,
          date: isoDate,
          totalTransactions: settlementData.transactions.length,
          matchedCount,
          unmatchedCount,
          grossAmountDollars: grossDollars,
        });
      } catch (err) {
        // Best-effort: log and continue to next MID
        console.error(
          `[Settlement] Failed to fetch settlement for MID ${ma.merchantId} on ${settleDate}:`,
          err,
        );
      }
    }
  });

  return results;
}

// ── Helpers ────────────────────────────────────────────────────────

interface MatchedLine {
  tenderId: string | null;
  originalAmountCents: number;
  settledAmountCents: number;
  feeCents: number;
  providerRef: string;
}

/**
 * Match provider settlement transactions to our payment_transactions by providerRef.
 */
async function matchTransactions(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tenantId: string,
  transactions: SettlementTransaction[],
): Promise<{ matchedCount: number; unmatchedCount: number; lines: MatchedLine[] }> {
  let matchedCount = 0;
  let unmatchedCount = 0;
  const lines: MatchedLine[] = [];

  for (const txn of transactions) {
    const amountCents = Math.round(parseFloat(txn.amount) * 100);

    // Look up our payment_transaction by providerRef
    const matchRows = await tx
      .select({
        intentId: paymentTransactions.paymentIntentId,
        amountCents: paymentTransactions.amountCents,
      })
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.tenantId, tenantId),
          eq(paymentTransactions.providerRef, txn.providerRef),
          eq(paymentTransactions.responseStatus, 'approved'),
        ),
      )
      .limit(1);

    if (matchRows.length > 0) {
      // Found a match — look up the tender ID from the payment intent
      const tenderRows = await tx.execute(sql`
        SELECT tender_id FROM payment_intents
        WHERE id = ${matchRows[0]!.intentId}
          AND tenant_id = ${tenantId}
          AND tender_id IS NOT NULL
        LIMIT 1
      `);
      const tenderArr = Array.from(tenderRows as Iterable<Record<string, unknown>>);
      const tenderId = tenderArr.length > 0 ? String(tenderArr[0]!.tender_id) : null;

      lines.push({
        tenderId,
        originalAmountCents: matchRows[0]!.amountCents,
        settledAmountCents: amountCents,
        feeCents: 0, // Fees come from the funding API or CSV import
        providerRef: txn.providerRef,
      });

      if (tenderId) {
        matchedCount++;
      } else {
        unmatchedCount++;
      }
    } else {
      // No match found — unmatched transaction from provider
      lines.push({
        tenderId: null,
        originalAmountCents: amountCents,
        settledAmountCents: amountCents,
        feeCents: 0,
        providerRef: txn.providerRef,
      });
      unmatchedCount++;
    }
  }

  return { matchedCount, unmatchedCount, lines };
}

/**
 * Convert MMDD date format to ISO YYYY-MM-DD.
 * Falls back to the provided reference date's year.
 */
function toIsoDate(mmdd: string, referenceDate: Date): string {
  if (mmdd.includes('-') && mmdd.length === 10) return mmdd; // already ISO

  const month = mmdd.slice(0, 2);
  const day = mmdd.slice(2, 4);
  const year = referenceDate.getFullYear();

  return `${year}-${month}-${day}`;
}
