import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { storedValueInstruments, storedValueTransactions, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { ReloadStoredValueInput } from '../validation';

/**
 * Adds value to an existing stored value instrument.
 *
 * Validates instrument exists and is active.
 * Creates a 'reload' transaction, updates currentBalanceCents.
 */
export async function reloadStoredValue(ctx: RequestContext, input: ReloadStoredValueInput) {
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
      throw new ValidationError(`Cannot reload instrument with status '${instrument.status}'`);
    }

    // Compute new balance
    const currentBalance = Number(instrument.currentBalanceCents);
    const newBalance = currentBalance + input.amountCents;

    // Compute new units remaining if unitDelta provided
    let newUnitsRemaining = instrument.unitsRemaining != null ? Number(instrument.unitsRemaining) : null;
    if (input.unitDelta != null) {
      newUnitsRemaining = (newUnitsRemaining ?? 0) + input.unitDelta;
    }

    // Update instrument
    const [updated] = await (tx as any).update(storedValueInstruments).set({
      currentBalanceCents: newBalance,
      unitsRemaining: newUnitsRemaining,
      updatedAt: new Date(),
    }).where(eq(storedValueInstruments.id, input.instrumentId)).returning();

    // Create reload transaction (append-only, positive amount)
    await (tx as any).insert(storedValueTransactions).values({
      tenantId: ctx.tenantId,
      instrumentId: input.instrumentId,
      customerId: instrument.customerId,
      txnType: 'reload',
      amountCents: input.amountCents,
      unitDelta: input.unitDelta ?? null,
      runningBalanceCents: newBalance,
      sourceModule: 'customers',
      sourceId: null,
      reason: input.reason ?? 'Reload',
      createdBy: ctx.user.id,
    });

    // Activity log if customer linked
    if (instrument.customerId) {
      await (tx as any).insert(customerActivityLog).values({
        tenantId: ctx.tenantId,
        customerId: instrument.customerId,
        activityType: 'system',
        title: `Stored value reloaded: +${input.amountCents} cents on ${instrument.code}`,
        metadata: {
          instrumentId: input.instrumentId,
          amountCents: input.amountCents,
          newBalance,
        },
        createdBy: ctx.user.id,
      });
    }

    const event = buildEventFromContext(ctx, 'customer.stored_value.reloaded.v1', {
      instrumentId: input.instrumentId,
      customerId: instrument.customerId,
      instrumentType: instrument.instrumentType,
      code: instrument.code,
      amountCents: input.amountCents,
      newBalance,
      liabilityGlAccountId: instrument.liabilityGlAccountId ?? null,
    });

    return { result: updated!, events: [event] };
  });

  await auditLog(ctx, 'customer.stored_value.reloaded', 'stored_value_instrument', input.instrumentId);
  return result;
}
