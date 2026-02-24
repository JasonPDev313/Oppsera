import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { paymentIntents } from '@oppsera/db';
import { AppError } from '@oppsera/shared';
import { publishWithOutbox, buildEventFromContext, auditLog } from '@oppsera/core';
import type { RequestContext } from '@oppsera/core';

// ── Validation ────────────────────────────────────────────────

export const resolveFailedPaymentSchema = z.object({
  paymentIntentId: z.string().min(1),
  resolution: z.enum(['resolved', 'dismissed']),
  reason: z.string().min(1).max(500),
  paidByOtherMeans: z.boolean().default(false),
  otherMeansType: z.string().max(50).optional(), // 'cash', 'check', 'transfer'
});

export type ResolveFailedPaymentInput = z.input<typeof resolveFailedPaymentSchema>;

// ── Command ───────────────────────────────────────────────────

export async function resolveFailedPayment(
  ctx: RequestContext,
  input: ResolveFailedPaymentInput,
) {
  const parsed = resolveFailedPaymentSchema.parse(input);

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [intent] = await tx
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.tenantId, ctx.tenantId),
          eq(paymentIntents.id, parsed.paymentIntentId),
        ),
      )
      .limit(1);

    if (!intent) {
      throw new AppError('NOT_FOUND', 'Payment intent not found', 404);
    }

    if (intent.status !== 'declined' && intent.status !== 'error') {
      throw new AppError(
        'INVALID_STATE',
        `Cannot resolve a payment in status '${intent.status}'. Only declined or error payments can be resolved.`,
        409,
      );
    }

    const existingMeta = (intent.metadata as Record<string, unknown>) ?? {};
    const resolutionMeta = {
      ...existingMeta,
      resolution: parsed.resolution,
      resolutionReason: parsed.reason,
      resolvedBy: ctx.user.id,
      resolvedAt: new Date().toISOString(),
      paidByOtherMeans: parsed.paidByOtherMeans,
      otherMeansType: parsed.otherMeansType ?? null,
    };

    const [updated] = await tx
      .update(paymentIntents)
      .set({
        status: 'resolved',
        metadata: resolutionMeta,
        updatedAt: new Date(),
      })
      .where(eq(paymentIntents.id, parsed.paymentIntentId))
      .returning();

    const event = buildEventFromContext(
      ctx,
      `payments.intent.${parsed.resolution}.v1`,
      {
        paymentIntentId: updated!.id,
        tenantId: ctx.tenantId,
        resolution: parsed.resolution,
        reason: parsed.reason,
        amountCents: updated!.amountCents,
        orderId: updated!.orderId,
      },
    );

    return {
      result: {
        id: updated!.id,
        status: updated!.status,
        resolution: parsed.resolution,
      },
      events: [event],
    };
  });

  await auditLog(
    ctx,
    `payment.intent.${parsed.resolution}`,
    'payment_intent',
    result.id,
  );

  return result;
}
