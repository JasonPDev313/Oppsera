import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { NotFoundError, ValidationError, ConflictError } from '@oppsera/shared';
import { storedValueInstruments, storedValueTransactions, customers, customerActivityLog } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { IssueStoredValueInput } from '../validation';

/**
 * Issues a new stored value instrument (gift card, credit book, range card, etc.)
 *
 * Creates the instrument record + initial 'issue' transaction.
 * GL posting (Dr Cash / Cr Stored Value Liability) is handled by event consumer
 * via AccountingPostingApi — never-throw pattern.
 */
export async function issueStoredValue(ctx: RequestContext, input: IssueStoredValueInput) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // If customerId provided, verify customer exists
    if (input.customerId) {
      const [customer] = await (tx as any).select({ id: customers.id }).from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.tenantId, ctx.tenantId)))
        .limit(1);
      if (!customer) throw new NotFoundError('Customer', input.customerId);
    }

    // Validate code uniqueness within tenant
    const [existingCode] = await (tx as any).select({ id: storedValueInstruments.id }).from(storedValueInstruments)
      .where(and(
        eq(storedValueInstruments.tenantId, ctx.tenantId),
        eq(storedValueInstruments.code, input.code),
      ))
      .limit(1);
    if (existingCode) throw new ConflictError(`Stored value instrument with code '${input.code}' already exists`);

    // Validate positive value for monetary instruments
    const initialValue = input.initialValueCents ?? 0;
    if (initialValue < 0) {
      throw new ValidationError('Initial value cannot be negative');
    }

    // Validate unit count if provided
    const unitCount = input.unitCount ?? null;
    if (unitCount !== null && unitCount <= 0) {
      throw new ValidationError('Unit count must be positive');
    }

    // Create the instrument
    const [created] = await (tx as any).insert(storedValueInstruments).values({
      tenantId: ctx.tenantId,
      customerId: input.customerId ?? null,
      instrumentType: input.instrumentType,
      code: input.code,
      status: 'active',
      initialValueCents: initialValue,
      currentBalanceCents: initialValue,
      unitCount: unitCount,
      unitsRemaining: unitCount,
      liabilityGlAccountId: input.liabilityGlAccountId ?? null,
      description: input.description ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      issuedBy: ctx.user.id,
      metaJson: input.metaJson ?? null,
    }).returning();

    // Create initial 'issue' transaction (append-only)
    await (tx as any).insert(storedValueTransactions).values({
      tenantId: ctx.tenantId,
      instrumentId: created!.id,
      customerId: input.customerId ?? null,
      txnType: 'issue',
      amountCents: initialValue,
      unitDelta: unitCount,
      runningBalanceCents: initialValue,
      sourceModule: 'customers',
      sourceId: null,
      reason: 'Initial issuance',
      createdBy: ctx.user.id,
    });

    // Activity log if customer is linked
    if (input.customerId) {
      await (tx as any).insert(customerActivityLog).values({
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        activityType: 'system',
        title: `Stored value issued: ${input.instrumentType} (${input.code})`,
        metadata: {
          instrumentId: created!.id,
          instrumentType: input.instrumentType,
          code: input.code,
          initialValueCents: initialValue,
          unitCount,
        },
        createdBy: ctx.user.id,
      });
    }

    const event = buildEventFromContext(ctx, 'customer.stored_value.issued.v1', {
      instrumentId: created!.id,
      customerId: input.customerId ?? null,
      instrumentType: input.instrumentType,
      code: input.code,
      initialValueCents: initialValue,
      unitCount,
      liabilityGlAccountId: input.liabilityGlAccountId ?? null,
    });

    return { result: created!, events: [event] };
  });

  await auditLog(ctx, 'customer.stored_value.issued', 'stored_value_instrument', result.id);
  return result;
}
