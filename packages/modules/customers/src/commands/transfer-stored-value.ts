import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError } from '@oppsera/shared';
import { storedValueInstruments, storedValueTransactions, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { TransferStoredValueInput } from '../validation';

/**
 * Transfers balance from one stored value instrument to another.
 *
 * Requires PIN approval (passed as approvedBy).
 * Validates both instruments exist and are active, and source has sufficient balance.
 * Creates two transactions atomically: 'transfer_out' on source, 'transfer_in' on target.
 * Updates both instrument balances.
 */
export async function transferStoredValue(ctx: RequestContext, input: TransferStoredValueInput) {
  if (input.sourceInstrumentId === input.targetInstrumentId) {
    throw new ValidationError('Cannot transfer to the same instrument');
  }

  const result = await publishWithOutbox(ctx, async (tx) => {
    // Fetch source instrument
    const [source] = await (tx as any).select().from(storedValueInstruments)
      .where(and(
        eq(storedValueInstruments.id, input.sourceInstrumentId),
        eq(storedValueInstruments.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!source) throw new NotFoundError('Source stored value instrument', input.sourceInstrumentId);

    // Fetch target instrument
    const [target] = await (tx as any).select().from(storedValueInstruments)
      .where(and(
        eq(storedValueInstruments.id, input.targetInstrumentId),
        eq(storedValueInstruments.tenantId, ctx.tenantId),
      ))
      .limit(1);
    if (!target) throw new NotFoundError('Target stored value instrument', input.targetInstrumentId);

    // Validate both are active
    if (source.status !== 'active') {
      throw new ValidationError(`Source instrument has status '${source.status}', must be 'active'`);
    }
    if (target.status !== 'active') {
      throw new ValidationError(`Target instrument has status '${target.status}', must be 'active'`);
    }

    // Validate sufficient balance on source
    const sourceBalance = Number(source.currentBalanceCents);
    if (sourceBalance < input.amountCents) {
      throw new ValidationError(
        `Insufficient balance: source has ${sourceBalance} cents, requested ${input.amountCents} cents`,
      );
    }

    // Compute new balances
    const newSourceBalance = sourceBalance - input.amountCents;
    const newTargetBalance = Number(target.currentBalanceCents) + input.amountCents;

    // Determine if source is fully redeemed
    const newSourceStatus = newSourceBalance === 0 ? 'redeemed' : 'active';

    // Update source instrument
    await (tx as any).update(storedValueInstruments).set({
      currentBalanceCents: newSourceBalance,
      status: newSourceStatus,
      updatedAt: new Date(),
    }).where(eq(storedValueInstruments.id, input.sourceInstrumentId));

    // Update target instrument
    await (tx as any).update(storedValueInstruments).set({
      currentBalanceCents: newTargetBalance,
      updatedAt: new Date(),
    }).where(eq(storedValueInstruments.id, input.targetInstrumentId));

    // Create transfer_out transaction on source (append-only)
    await (tx as any).insert(storedValueTransactions).values({
      tenantId: ctx.tenantId,
      instrumentId: input.sourceInstrumentId,
      customerId: source.customerId,
      txnType: 'transfer_out',
      amountCents: -input.amountCents,
      unitDelta: null,
      runningBalanceCents: newSourceBalance,
      sourceModule: 'customers',
      sourceId: input.targetInstrumentId,
      reason: input.reason ?? `Transfer to ${target.code}`,
      createdBy: ctx.user.id,
    });

    // Create transfer_in transaction on target (append-only)
    await (tx as any).insert(storedValueTransactions).values({
      tenantId: ctx.tenantId,
      instrumentId: input.targetInstrumentId,
      customerId: target.customerId,
      txnType: 'transfer_in',
      amountCents: input.amountCents,
      unitDelta: null,
      runningBalanceCents: newTargetBalance,
      sourceModule: 'customers',
      sourceId: input.sourceInstrumentId,
      reason: input.reason ?? `Transfer from ${source.code}`,
      createdBy: ctx.user.id,
    });

    // Activity log for source customer
    if (source.customerId) {
      await (tx as any).insert(customerActivityLog).values({
        tenantId: ctx.tenantId,
        customerId: source.customerId,
        activityType: 'system',
        title: `Stored value transferred out: ${input.amountCents} cents from ${source.code} to ${target.code}`,
        metadata: {
          sourceInstrumentId: input.sourceInstrumentId,
          targetInstrumentId: input.targetInstrumentId,
          amountCents: input.amountCents,
          newSourceBalance,
          approvedBy: input.approvedBy,
        },
        createdBy: ctx.user.id,
      });
    }

    // Activity log for target customer (if different from source)
    if (target.customerId && target.customerId !== source.customerId) {
      await (tx as any).insert(customerActivityLog).values({
        tenantId: ctx.tenantId,
        customerId: target.customerId,
        activityType: 'system',
        title: `Stored value transferred in: ${input.amountCents} cents to ${target.code} from ${source.code}`,
        metadata: {
          sourceInstrumentId: input.sourceInstrumentId,
          targetInstrumentId: input.targetInstrumentId,
          amountCents: input.amountCents,
          newTargetBalance,
          approvedBy: input.approvedBy,
        },
        createdBy: ctx.user.id,
      });
    }

    const event = buildEventFromContext(ctx, 'customer.stored_value.transferred.v1', {
      sourceInstrumentId: input.sourceInstrumentId,
      targetInstrumentId: input.targetInstrumentId,
      sourceCustomerId: source.customerId,
      targetCustomerId: target.customerId,
      amountCents: input.amountCents,
      newSourceBalance,
      newTargetBalance,
      newSourceStatus,
      approvedBy: input.approvedBy,
    });

    return {
      result: {
        sourceInstrumentId: input.sourceInstrumentId,
        targetInstrumentId: input.targetInstrumentId,
        amountCents: input.amountCents,
        newSourceBalance,
        newTargetBalance,
        newSourceStatus,
      },
      events: [event],
    };
  });

  await auditLog(ctx, 'customer.stored_value.transferred', 'stored_value_instrument', input.sourceInstrumentId);
  return result;
}
