import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { customerPaymentMethods, achMicroDeposits } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { VerifyMicroDepositsInput } from '../gateway-validation';

export interface VerifyMicroDepositsResult {
  verified: boolean;
  remainingAttempts: number;
}

/**
 * Verify micro-deposit amounts entered by the customer.
 * On success: verification_status → 'verified'.
 * On failure: increment attempts, fail if max reached.
 */
export async function verifyMicroDeposits(
  ctx: RequestContext,
  input: VerifyMicroDepositsInput,
): Promise<VerifyMicroDepositsResult> {
  const result = await publishWithOutbox(ctx, async (tx) => {
    // 1. Load the pending micro-deposit record
    const [deposit] = await tx
      .select()
      .from(achMicroDeposits)
      .where(
        and(
          eq(achMicroDeposits.paymentMethodId, input.paymentMethodId),
          eq(achMicroDeposits.tenantId, ctx.tenantId),
          eq(achMicroDeposits.status, 'pending'),
        ),
      )
      .limit(1);

    if (!deposit) {
      throw new AppError('NO_PENDING_VERIFICATION', 'No pending micro-deposit verification found', 404);
    }

    // Check expiry
    if (deposit.expiresAt && new Date() > deposit.expiresAt) {
      await tx
        .update(achMicroDeposits)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(achMicroDeposits.id, deposit.id));

      await tx
        .update(customerPaymentMethods)
        .set({ verificationStatus: 'failed', updatedAt: new Date() })
        .where(eq(customerPaymentMethods.id, input.paymentMethodId));

      throw new AppError('VERIFICATION_EXPIRED', 'Micro-deposit verification has expired', 410);
    }

    // 2. Compare amounts (order-independent)
    const expected = [deposit.amount1Cents, deposit.amount2Cents].sort((a, b) => a - b);
    const provided = [input.amount1Cents, input.amount2Cents].sort((a, b) => a - b);
    const matches = expected[0] === provided[0] && expected[1] === provided[1];

    if (matches) {
      // Success — mark verified
      await tx
        .update(achMicroDeposits)
        .set({
          status: 'verified',
          attempts: deposit.attempts + 1,
          updatedAt: new Date(),
        })
        .where(eq(achMicroDeposits.id, deposit.id));

      await tx
        .update(customerPaymentMethods)
        .set({
          verificationStatus: 'verified',
          verificationAttempts: deposit.attempts + 1,
          updatedAt: new Date(),
        })
        .where(eq(customerPaymentMethods.id, input.paymentMethodId));

      return {
        result: { verified: true, remainingAttempts: 0 } satisfies VerifyMicroDepositsResult,
        events: [],
      };
    }

    // 3. Failed attempt
    const newAttempts = deposit.attempts + 1;
    const maxExceeded = newAttempts >= deposit.maxAttempts;

    await tx
      .update(achMicroDeposits)
      .set({
        status: maxExceeded ? 'failed' : 'pending',
        attempts: newAttempts,
        updatedAt: new Date(),
      })
      .where(eq(achMicroDeposits.id, deposit.id));

    if (maxExceeded) {
      await tx
        .update(customerPaymentMethods)
        .set({
          verificationStatus: 'failed',
          verificationAttempts: newAttempts,
          updatedAt: new Date(),
        })
        .where(eq(customerPaymentMethods.id, input.paymentMethodId));
    } else {
      await tx
        .update(customerPaymentMethods)
        .set({
          verificationAttempts: newAttempts,
          updatedAt: new Date(),
        })
        .where(eq(customerPaymentMethods.id, input.paymentMethodId));
    }

    return {
      result: {
        verified: false,
        remainingAttempts: maxExceeded ? 0 : deposit.maxAttempts - newAttempts,
      } satisfies VerifyMicroDepositsResult,
      events: [],
    };
  });

  await auditLog(ctx, 'payment.micro_deposit.verified', 'customer_payment_method', input.paymentMethodId);
  return result;
}
