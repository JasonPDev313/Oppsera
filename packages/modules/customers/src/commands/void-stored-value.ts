import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { storedValueInstruments, storedValueTransactions, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { VoidStoredValueInput } from '../validation';

/**
 * Voids a stored value instrument entirely.
 *
 * Requires PIN approval (passed as approvedBy).
 * Validates instrument exists and is not already voided.
 * Creates a 'void' transaction zeroing the balance, sets status to 'voided'.
 */
export async function voidStoredValue(ctx: RequestContext, input: VoidStoredValueInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch instrument
    const [instrument] = await (tx as any).select().from(storedValueInstruments)
      .where(and(
        eq(storedValueInstruments.id, input.instrumentId),
        eq(storedValueInstruments.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!instrument) throw new NotFoundError('Stored value instrument', input.instrumentId);

    // Validate not already voided
    if (instrument.status === 'voided') {
      throw new ValidationError('Instrument is already voided');
    }

    // Compute the remaining balance to zero out
    const remainingBalance = Number(instrument.currentBalanceCents);
    const remainingUnits = instrument.unitsRemaining != null ? Number(instrument.unitsRemaining) : null;

    // Update instrument to voided
    const [updated] = await (tx as any).update(storedValueInstruments).set({
      currentBalanceCents: 0,
      unitsRemaining: remainingUnits != null ? 0 : null,
      status: 'voided',
      updatedAt: new Date(),
    }).where(eq(storedValueInstruments.id, input.instrumentId)).returning();

    // Create void transaction (append-only, negative of remaining balance)
    await (tx as any).insert(storedValueTransactions).values({
      tenantId: ctx.tenantId,
      instrumentId: input.instrumentId,
      customerId: instrument.customerId,
      txnType: 'void',
      amountCents: -remainingBalance,
      unitDelta: remainingUnits != null ? -remainingUnits : null,
      runningBalanceCents: 0,
      sourceModule: 'customers',
      sourceId: null,
      reason: input.reason ?? 'Instrument voided',
      createdBy: ctx.user.id,
    });

    // Activity log if customer linked
    if (instrument.customerId) {
      await (tx as any).insert(customerActivityLog).values({
        tenantId: ctx.tenantId,
        customerId: instrument.customerId,
        activityType: 'system',
        title: `Stored value voided: ${instrument.code} (was ${remainingBalance} cents)`,
        metadata: {
          instrumentId: input.instrumentId,
          code: instrument.code,
          previousBalance: remainingBalance,
          approvedBy: input.approvedBy,
          reason: input.reason ?? null,
        },
        createdBy: ctx.user.id,
      });
    }

    const event = buildEventFromContext(ctx, 'customer.stored_value.voided.v1', {
      instrumentId: input.instrumentId,
      customerId: instrument.customerId,
      instrumentType: instrument.instrumentType,
      code: instrument.code,
      previousBalance: remainingBalance,
      approvedBy: input.approvedBy,
      liabilityGlAccountId: instrument.liabilityGlAccountId ?? null,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.stored_value.voided', 'stored_value_instrument', input.instrumentId);
  return result;
}
