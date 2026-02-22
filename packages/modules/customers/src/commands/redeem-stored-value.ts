import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { storedValueInstruments, storedValueTransactions, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { RedeemStoredValueInput } from '../validation';

/**
 * Redeems value from a stored value instrument.
 *
 * Validates instrument exists, is active, and has sufficient balance.
 * Creates a 'redeem' transaction with negative amount, updates currentBalanceCents.
 * If fully redeemed (balance reaches 0), sets status to 'redeemed'.
 */
export async function redeemStoredValue(ctx: RequestContext, input: RedeemStoredValueInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch instrument
    const [instrument] = await (tx as any).select().from(storedValueInstruments)
      .where(and(
        eq(storedValueInstruments.id, input.instrumentId),
        eq(storedValueInstruments.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!instrument) throw new NotFoundError('Stored value instrument', input.instrumentId);

    // Validate status is active
    if (instrument.status !== 'active') {
      throw new ValidationError(`Cannot redeem from instrument with status '${instrument.status}'`);
    }

    // Validate sufficient balance
    const currentBalance = Number(instrument.currentBalanceCents);
    if (currentBalance < input.amountCents) {
      throw new ValidationError(
        `Insufficient balance: instrument has ${currentBalance} cents, requested ${input.amountCents} cents`,
      );
    }

    // Compute new balance
    const newBalance = currentBalance - input.amountCents;

    // Compute new units remaining if unitDelta provided
    let newUnitsRemaining = instrument.unitsRemaining != null ? Number(instrument.unitsRemaining) : null;
    if (input.unitDelta != null && newUnitsRemaining != null) {
      newUnitsRemaining = newUnitsRemaining - input.unitDelta;
      if (newUnitsRemaining < 0) {
        throw new ValidationError('Insufficient units remaining');
      }
    }

    // Determine if fully redeemed
    const newStatus = newBalance === 0 ? 'redeemed' : 'active';

    // Update instrument
    const [updated] = await (tx as any).update(storedValueInstruments).set({
      currentBalanceCents: newBalance,
      unitsRemaining: newUnitsRemaining,
      status: newStatus,
      updatedAt: new Date(),
    }).where(eq(storedValueInstruments.id, input.instrumentId)).returning();

    // Create redeem transaction (append-only, negative amount)
    await (tx as any).insert(storedValueTransactions).values({
      tenantId: ctx.tenantId,
      instrumentId: input.instrumentId,
      customerId: instrument.customerId,
      txnType: 'redeem',
      amountCents: -input.amountCents,
      unitDelta: input.unitDelta != null ? -input.unitDelta : null,
      runningBalanceCents: newBalance,
      sourceModule: input.sourceModule ?? null,
      sourceId: input.sourceId ?? null,
      reason: input.reason ?? 'Redemption',
      createdBy: ctx.user.id,
    });

    // Activity log if customer linked
    if (instrument.customerId) {
      await (tx as any).insert(customerActivityLog).values({
        tenantId: ctx.tenantId,
        customerId: instrument.customerId,
        activityType: 'system',
        title: `Stored value redeemed: ${input.amountCents} cents from ${instrument.code}`,
        metadata: {
          instrumentId: input.instrumentId,
          amountCents: input.amountCents,
          newBalance,
          newStatus,
        },
        createdBy: ctx.user.id,
      });
    }

    const event = buildEventFromContext(ctx, 'customer.stored_value.redeemed.v1', {
      instrumentId: input.instrumentId,
      customerId: instrument.customerId,
      instrumentType: instrument.instrumentType,
      code: instrument.code,
      amountCents: input.amountCents,
      newBalance,
      newStatus,
      sourceModule: input.sourceModule ?? null,
      sourceId: input.sourceId ?? null,
      liabilityGlAccountId: instrument.liabilityGlAccountId ?? null,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.stored_value.redeemed', 'stored_value_instrument', input.instrumentId);
  return result;
}
