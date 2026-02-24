import { z } from 'zod';
import { withTenant } from '@oppsera/db';
import {
  paymentSettlements,
  paymentSettlementLines,
} from '@oppsera/db';
import { eq, and, sql } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core/auth/context';

// ── Validation ─────────────────────────────────────────────────────

export const matchSettlementSchema = z.object({
  settlementId: z.string().min(1),
});

export type MatchSettlementInput = z.input<typeof matchSettlementSchema>;

export const retryMatchSchema = z.object({
  settlementId: z.string().min(1),
  lineId: z.string().min(1),
  tenderId: z.string().min(1),
});

export type RetryMatchInput = z.input<typeof retryMatchSchema>;

// ── Results ────────────────────────────────────────────────────────

export interface MatchSettlementResult {
  settlementId: string;
  totalLines: number;
  matchedCount: number;
  unmatchedCount: number;
  varianceCents: number; // sum(our amounts) - sum(settled amounts) for matched lines
}

export interface SettlementVariance {
  totalOurAmountCents: number;
  totalSettledAmountCents: number;
  varianceCents: number;
  missingFromSettlement: number; // our captured transactions not in settlement
}

/**
 * Re-run matching for an existing settlement.
 * Useful when new payment transactions arrive after initial fetch,
 * or to rematch after fixing data.
 *
 * Only processes unmatched lines — already matched lines are untouched.
 */
export async function matchSettlement(
  ctx: RequestContext,
  input: MatchSettlementInput,
): Promise<MatchSettlementResult> {
  const { settlementId } = input;

  return withTenant(ctx.tenantId, async (tx) => {
    // 1. Verify settlement exists
    const [settlement] = await tx
      .select({
        id: paymentSettlements.id,
        status: paymentSettlements.status,
        processorName: paymentSettlements.processorName,
      })
      .from(paymentSettlements)
      .where(
        and(
          eq(paymentSettlements.tenantId, ctx.tenantId),
          eq(paymentSettlements.id, settlementId),
        ),
      )
      .limit(1);

    if (!settlement) {
      throw new AppError('NOT_FOUND', 'Settlement not found', 404);
    }

    if (settlement.status === 'posted') {
      throw new AppError('SETTLEMENT_POSTED', 'Cannot rematch a posted settlement', 409);
    }

    // 2. Get all unmatched lines
    const unmatchedLines = await tx
      .select({
        id: paymentSettlementLines.id,
        settledAmountCents: paymentSettlementLines.settledAmountCents,
        originalAmountCents: paymentSettlementLines.originalAmountCents,
      })
      .from(paymentSettlementLines)
      .where(
        and(
          eq(paymentSettlementLines.tenantId, ctx.tenantId),
          eq(paymentSettlementLines.settlementId, settlementId),
          eq(paymentSettlementLines.status, 'unmatched'),
        ),
      );

    // 3. Get already-matched count
    const matchedRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM payment_settlement_lines
      WHERE tenant_id = ${ctx.tenantId}
        AND settlement_id = ${settlementId}
        AND status = 'matched'
    `);
    const matchedArr = Array.from(matchedRows as Iterable<Record<string, unknown>>);
    let matchedCount = Number(matchedArr[0]!.count);
    let unmatchedCount = 0;

    // 4. Try to match each unmatched line
    for (const line of unmatchedLines) {
      // Look for payment_transactions matching amount
      const candidateRows = await tx.execute(sql`
        SELECT pt.payment_intent_id, pi.tender_id
        FROM payment_transactions pt
        JOIN payment_intents pi ON pi.id = pt.payment_intent_id
        WHERE pt.tenant_id = ${ctx.tenantId}
          AND pt.response_status = 'approved'
          AND pt.amount_cents = ${line.settledAmountCents}
          AND pi.tender_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM payment_settlement_lines psl
            WHERE psl.tender_id = pi.tender_id
              AND psl.tenant_id = ${ctx.tenantId}
              AND psl.status = 'matched'
          )
        ORDER BY pt.created_at DESC
        LIMIT 1
      `);
      const candidateArr = Array.from(candidateRows as Iterable<Record<string, unknown>>);

      if (candidateArr.length > 0) {
        const tenderId = String(candidateArr[0]!.tender_id);

        await tx
          .update(paymentSettlementLines)
          .set({
            tenderId,
            status: 'matched',
            matchedAt: new Date(),
          })
          .where(
            and(
              eq(paymentSettlementLines.id, line.id),
              eq(paymentSettlementLines.tenantId, ctx.tenantId),
            ),
          );

        matchedCount++;
      } else {
        unmatchedCount++;
      }
    }

    // 5. Update settlement status
    const totalLines = matchedCount + unmatchedCount;
    const newStatus = unmatchedCount === 0 ? 'matched' : 'pending';

    await tx
      .update(paymentSettlements)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentSettlements.id, settlementId),
          eq(paymentSettlements.tenantId, ctx.tenantId),
        ),
      );

    // 6. Calculate variance
    const varianceRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(original_amount_cents), 0)::integer AS our_total,
        COALESCE(SUM(settled_amount_cents), 0)::integer AS settled_total
      FROM payment_settlement_lines
      WHERE tenant_id = ${ctx.tenantId}
        AND settlement_id = ${settlementId}
        AND status = 'matched'
    `);
    const varianceArr = Array.from(varianceRows as Iterable<Record<string, unknown>>);
    const ourTotal = Number(varianceArr[0]!.our_total);
    const settledTotal = Number(varianceArr[0]!.settled_total);

    return {
      settlementId,
      totalLines,
      matchedCount,
      unmatchedCount,
      varianceCents: ourTotal - settledTotal,
    };
  });
}

/**
 * Manually match a specific settlement line to a tender.
 * Used when automatic matching fails and admin identifies the correct tender.
 */
export async function manualMatchSettlementLine(
  ctx: RequestContext,
  input: RetryMatchInput,
): Promise<void> {
  return withTenant(ctx.tenantId, async (tx) => {
    // Verify settlement line exists and is unmatched
    const [line] = await tx
      .select({
        id: paymentSettlementLines.id,
        status: paymentSettlementLines.status,
        settlementId: paymentSettlementLines.settlementId,
      })
      .from(paymentSettlementLines)
      .where(
        and(
          eq(paymentSettlementLines.tenantId, ctx.tenantId),
          eq(paymentSettlementLines.id, input.lineId),
          eq(paymentSettlementLines.settlementId, input.settlementId),
        ),
      )
      .limit(1);

    if (!line) {
      throw new AppError('NOT_FOUND', 'Settlement line not found', 404);
    }

    if (line.status === 'matched') {
      throw new AppError('ALREADY_MATCHED', 'Settlement line is already matched', 409);
    }

    // Verify settlement isn't posted
    const [settlement] = await tx
      .select({ status: paymentSettlements.status })
      .from(paymentSettlements)
      .where(
        and(
          eq(paymentSettlements.tenantId, ctx.tenantId),
          eq(paymentSettlements.id, input.settlementId),
        ),
      )
      .limit(1);

    if (settlement?.status === 'posted') {
      throw new AppError('SETTLEMENT_POSTED', 'Cannot modify a posted settlement', 409);
    }

    // Update the line
    await tx
      .update(paymentSettlementLines)
      .set({
        tenderId: input.tenderId,
        status: 'matched',
        matchedAt: new Date(),
      })
      .where(
        and(
          eq(paymentSettlementLines.id, input.lineId),
          eq(paymentSettlementLines.tenantId, ctx.tenantId),
        ),
      );

    // Check if all lines are now matched → update settlement status
    const unmatchedRows = await tx.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM payment_settlement_lines
      WHERE tenant_id = ${ctx.tenantId}
        AND settlement_id = ${input.settlementId}
        AND status = 'unmatched'
    `);
    const unmatchedArr = Array.from(unmatchedRows as Iterable<Record<string, unknown>>);
    const remaining = Number(unmatchedArr[0]!.count);

    if (remaining === 0) {
      await tx
        .update(paymentSettlements)
        .set({ status: 'matched', updatedAt: new Date() })
        .where(
          and(
            eq(paymentSettlements.id, input.settlementId),
            eq(paymentSettlements.tenantId, ctx.tenantId),
          ),
        );
    }
  });
}

/**
 * Calculate variance between our captured transactions and settlement data.
 *
 * Returns:
 * - Total of our captured amounts for matched lines
 * - Total of settled amounts
 * - Variance (our - settled) — positive means we captured more than settled
 * - Count of captured transactions missing from settlement (after 3+ days)
 */
export async function getSettlementVariance(
  tenantId: string,
  settlementId: string,
): Promise<SettlementVariance> {
  return withTenant(tenantId, async (tx) => {
    // Matched line amounts
    const amountRows = await tx.execute(sql`
      SELECT
        COALESCE(SUM(original_amount_cents), 0)::integer AS our_total,
        COALESCE(SUM(settled_amount_cents), 0)::integer AS settled_total
      FROM payment_settlement_lines
      WHERE tenant_id = ${tenantId}
        AND settlement_id = ${settlementId}
        AND status = 'matched'
    `);
    const amountArr = Array.from(amountRows as Iterable<Record<string, unknown>>);
    const ourTotal = Number(amountArr[0]!.our_total);
    const settledTotal = Number(amountArr[0]!.settled_total);

    // Get settlement date for missing check
    const [settlement] = await tx
      .select({
        settlementDate: paymentSettlements.settlementDate,
        businessDateFrom: paymentSettlements.businessDateFrom,
        businessDateTo: paymentSettlements.businessDateTo,
      })
      .from(paymentSettlements)
      .where(
        and(
          eq(paymentSettlements.tenantId, tenantId),
          eq(paymentSettlements.id, settlementId),
        ),
      )
      .limit(1);

    let missingFromSettlement = 0;

    if (settlement?.businessDateFrom) {
      // Count captured intents in date range that have no settlement line
      const missingRows = await tx.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM payment_intents pi
        WHERE pi.tenant_id = ${tenantId}
          AND pi.status = 'captured'
          AND pi.created_at >= ${settlement.businessDateFrom}::date
          AND pi.created_at < (${settlement.businessDateTo ?? settlement.businessDateFrom}::date + INTERVAL '1 day')
          AND pi.tender_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM payment_settlement_lines psl
            WHERE psl.tender_id = pi.tender_id
              AND psl.tenant_id = ${tenantId}
          )
      `);
      const missingArr = Array.from(missingRows as Iterable<Record<string, unknown>>);
      missingFromSettlement = Number(missingArr[0]!.count);
    }

    return {
      totalOurAmountCents: ourTotal,
      totalSettledAmountCents: settledTotal,
      varianceCents: ourTotal - settledTotal,
      missingFromSettlement,
    };
  });
}
