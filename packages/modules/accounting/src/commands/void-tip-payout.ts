import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { tipPayouts } from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { voidJournalEntry } from './void-journal-entry';
import type { VoidTipPayoutInput } from '../validation';

/**
 * Void a tip payout. Creates a GL reversal journal entry.
 */
export async function voidTipPayout(
  ctx: RequestContext,
  input: VoidTipPayoutInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    const [payout] = await tx
      .select()
      .from(tipPayouts)
      .where(
        and(
          eq(tipPayouts.tenantId, ctx.tenantId),
          eq(tipPayouts.id, input.payoutId),
        ),
      )
      .limit(1);

    if (!payout) {
      throw new NotFoundError('Tip Payout', input.payoutId);
    }

    if (payout.status === 'voided') {
      throw new Error('Tip payout is already voided');
    }

    // Update payout status
    await tx
      .update(tipPayouts)
      .set({ status: 'voided' })
      .where(
        and(
          eq(tipPayouts.tenantId, ctx.tenantId),
          eq(tipPayouts.id, input.payoutId),
        ),
      );

    const event = buildEventFromContext(ctx, 'tip.payout.voided.v1', {
      payoutId: payout.id,
      employeeId: payout.employeeId,
      amountCents: payout.amountCents,
      reason: input.reason,
    });

    return {
      result: { ...payout, status: 'voided' as const },
      events: [event],
    };
  });

  // Void the GL journal entry outside the main transaction
  if (result.glJournalEntryId) {
    await voidJournalEntry(ctx, result.glJournalEntryId, `Tip payout voided: ${input.reason}`);
  }

  await auditLog(ctx, 'accounting.tip_payout.voided', 'tip_payout', input.payoutId);
  return result;
}
