import { eq, and, inArray, isNotNull } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { paymentSettlements, paymentSettlementLines } from '@oppsera/db';
import { NotFoundError, AppError } from '@oppsera/shared';
import { getReconciliationReadApi } from '@oppsera/core/helpers/reconciliation-read-api';
import type { MatchSettlementTendersInput } from '../validation';
import { ACCOUNTING_EVENTS } from '../events/types';

export async function matchSettlementTenders(
  ctx: RequestContext,
  input: MatchSettlementTendersInput,
) {
  // ── Pre-transaction validation: verify tenders exist ──────────
  // Tenders live in the payments module — use ReconciliationReadApi
  // (cross-module read pattern) to validate existence without breaking
  // module boundaries. Done BEFORE the transaction to avoid holding
  // DB connections during cross-module reads.
  const tenderIds = input.matches.map((m) => m.tenderId);
  const reconciliationApi = getReconciliationReadApi();
  const invalidTenderIds: string[] = [];

  // Batch-validate: check each tender exists via audit trail lookup
  await Promise.all(
    tenderIds.map(async (tenderId) => {
      const trail = await reconciliationApi.getTenderAuditTrail(ctx.tenantId, tenderId);
      if (!trail) invalidTenderIds.push(tenderId);
    }),
  );

  if (invalidTenderIds.length > 0) {
    throw new AppError(
      'TENDER_NOT_FOUND',
      `Tender(s) not found: ${invalidTenderIds.join(', ')}. Verify tender IDs before matching.`,
      404,
    );
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Verify settlement exists and is in matchable state
    const [settlement] = await tx
      .select()
      .from(paymentSettlements)
      .where(
        and(
          eq(paymentSettlements.tenantId, ctx.tenantId),
          eq(paymentSettlements.id, input.settlementId),
        ),
      )
      .limit(1);

    if (!settlement) {
      throw new NotFoundError('Payment Settlement', input.settlementId);
    }

    if (settlement.status === 'posted') {
      throw new Error('Cannot match tenders on a posted settlement');
    }

    // ── Validation: uniqueness within batch ──────────────────────
    const tenderIds = input.matches.map((m) => m.tenderId);
    const uniqueTenderIds = new Set(tenderIds);
    if (uniqueTenderIds.size !== tenderIds.length) {
      throw new AppError(
        'DUPLICATE_TENDER',
        'The same tender cannot be matched to multiple settlement lines in one request',
        400,
      );
    }

    // ── Validation: tenders not already matched elsewhere ────────
    // Check if any of these tenderIds are already assigned to other
    // settlement lines (across ALL settlements for this tenant).
    const lineIdsInBatch = new Set(input.matches.map((m) => m.settlementLineId));
    const existingMatches = await tx
      .select({
        id: paymentSettlementLines.id,
        tenderId: paymentSettlementLines.tenderId,
        settlementId: paymentSettlementLines.settlementId,
      })
      .from(paymentSettlementLines)
      .where(
        and(
          eq(paymentSettlementLines.tenantId, ctx.tenantId),
          inArray(paymentSettlementLines.tenderId, [...uniqueTenderIds]),
          isNotNull(paymentSettlementLines.tenderId),
        ),
      );

    // Filter to matches that are NOT lines in this batch (i.e. already matched elsewhere)
    const conflicting = existingMatches.filter((m) => !lineIdsInBatch.has(m.id));
    if (conflicting.length > 0) {
      const details = conflicting.map((c) => `tender ${c.tenderId} already matched on settlement ${c.settlementId}`).join('; ');
      throw new AppError(
        'TENDER_ALREADY_MATCHED',
        `Cannot match: ${details}`,
        409,
      );
    }

    let matchedCount = 0;

    for (const match of input.matches) {
      const [line] = await tx
        .select()
        .from(paymentSettlementLines)
        .where(
          and(
            eq(paymentSettlementLines.tenantId, ctx.tenantId),
            eq(paymentSettlementLines.id, match.settlementLineId),
            eq(paymentSettlementLines.settlementId, input.settlementId),
          ),
        )
        .limit(1);

      if (!line) {
        throw new NotFoundError('Settlement Line', match.settlementLineId);
      }

      // Only match lines that are currently unmatched — prevents re-matching
      // already-matched lines without explicit unmatch first.
      if (line.status !== 'unmatched') {
        throw new AppError(
          'LINE_ALREADY_MATCHED',
          `Settlement line ${match.settlementLineId} is already matched (status: ${line.status})`,
          409,
        );
      }

      const [updated] = await tx
        .update(paymentSettlementLines)
        .set({
          tenderId: match.tenderId,
          status: 'matched',
          matchedAt: new Date(),
        })
        .where(
          and(
            eq(paymentSettlementLines.tenantId, ctx.tenantId),
            eq(paymentSettlementLines.id, match.settlementLineId),
            eq(paymentSettlementLines.status, 'unmatched'),
          ),
        )
        .returning({ id: paymentSettlementLines.id });

      // Verify the UPDATE actually changed a row — concurrent requests can
      // both read status='unmatched' but only the first UPDATE succeeds.
      if (!updated) {
        throw new AppError(
          'CONCURRENT_MATCH',
          `Settlement line ${match.settlementLineId} was matched by a concurrent request`,
          409,
        );
      }

      matchedCount++;
    }

    // Check if all lines are now matched → update settlement status
    const unmatchedLines = await tx
      .select({ id: paymentSettlementLines.id })
      .from(paymentSettlementLines)
      .where(
        and(
          eq(paymentSettlementLines.tenantId, ctx.tenantId),
          eq(paymentSettlementLines.settlementId, input.settlementId),
          eq(paymentSettlementLines.status, 'unmatched'),
        ),
      )
      .limit(1);

    if (unmatchedLines.length === 0) {
      await tx
        .update(paymentSettlements)
        .set({ status: 'matched', updatedAt: new Date() })
        .where(
          and(
            eq(paymentSettlements.tenantId, ctx.tenantId),
            eq(paymentSettlements.id, input.settlementId),
          ),
        );
    }

    const event = buildEventFromContext(ctx, ACCOUNTING_EVENTS.SETTLEMENT_MATCHED, {
      settlementId: input.settlementId,
      matchedCount,
    });

    return { result: { settlementId: input.settlementId, matchedCount }, events: [event] };
  });

  auditLogDeferred(ctx, 'accounting.settlement.matched', 'payment_settlement', input.settlementId);
  return result;
}
