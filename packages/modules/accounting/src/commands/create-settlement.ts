import { eq, and } from 'drizzle-orm';
import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import { checkIdempotency, saveIdempotencyKey } from '@oppsera/core/helpers/idempotency';
import type { RequestContext } from '@oppsera/core/auth/context';
import { paymentSettlements, paymentSettlementLines } from '@oppsera/db';
import { generateUlid, ConflictError } from '@oppsera/shared';
import type { CreateSettlementInput } from '../validation';

export async function createSettlement(
  ctx: RequestContext,
  input: CreateSettlementInput,
) {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Idempotency check
    const idempotencyCheck = await checkIdempotency(tx, ctx.tenantId, input.clientRequestId, 'createSettlement');
    if (idempotencyCheck.isDuplicate) return { result: idempotencyCheck.originalResult as any, events: [] };

    // Check for duplicate (tenant + processor + batch ID)
    if (input.processorBatchId) {
      const [existing] = await tx
        .select({ id: paymentSettlements.id })
        .from(paymentSettlements)
        .where(
          and(
            eq(paymentSettlements.tenantId, ctx.tenantId),
            eq(paymentSettlements.processorName, input.processorName),
            eq(paymentSettlements.processorBatchId, input.processorBatchId),
          ),
        )
        .limit(1);

      if (existing) {
        throw new ConflictError(
          `Settlement for processor '${input.processorName}' batch '${input.processorBatchId}' already exists`,
        );
      }
    }

    const settlementId = generateUlid();

    const [settlement] = await tx
      .insert(paymentSettlements)
      .values({
        id: settlementId,
        tenantId: ctx.tenantId,
        locationId: input.locationId ?? null,
        settlementDate: input.settlementDate,
        processorName: input.processorName,
        processorBatchId: input.processorBatchId ?? null,
        grossAmount: input.grossAmount,
        feeAmount: input.feeAmount ?? '0',
        netAmount: input.netAmount,
        chargebackAmount: input.chargebackAmount ?? '0',
        bankAccountId: input.bankAccountId ?? null,
        importSource: input.importSource ?? 'manual',
        rawData: input.rawData ?? null,
        businessDateFrom: input.businessDateFrom ?? null,
        businessDateTo: input.businessDateTo ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    // Insert lines if provided
    if (input.lines && input.lines.length > 0) {
      for (const line of input.lines) {
        await tx
          .insert(paymentSettlementLines)
          .values({
            id: generateUlid(),
            tenantId: ctx.tenantId,
            settlementId,
            tenderId: line.tenderId ?? null,
            originalAmountCents: line.originalAmountCents,
            settledAmountCents: line.settledAmountCents,
            feeCents: line.feeCents ?? 0,
            netCents: line.netCents,
            status: line.tenderId ? 'matched' : 'unmatched',
            matchedAt: line.tenderId ? new Date() : null,
          });
      }
    }

    const event = buildEventFromContext(ctx, 'accounting.settlement.created.v1', {
      settlementId,
      processorName: input.processorName,
      grossAmount: input.grossAmount,
    });

    await saveIdempotencyKey(tx, ctx.tenantId, input.clientRequestId, 'createSettlement', settlement!);

    return { result: settlement!, events: [event] };
  });

  await auditLog(ctx, 'accounting.settlement.created', 'payment_settlement', result.id);
  return result;
}
