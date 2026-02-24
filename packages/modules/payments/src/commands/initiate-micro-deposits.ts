import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { customerPaymentMethods, achMicroDeposits } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { resolveProvider } from '../helpers/resolve-provider';
import { centsToDollars } from '../helpers/amount';

export interface InitiateMicroDepositsResult {
  microDepositId: string;
  paymentMethodId: string;
  expiresAt: Date;
}

/**
 * Initiate micro-deposit verification for a bank account.
 * Sends two small random-amount ACH credits (1-99 cents each) via CardPointe sale.
 * Customer must verify the amounts to confirm bank account ownership.
 */
export async function initiateMicroDeposits(
  ctx: RequestContext,
  paymentMethodId: string,
): Promise<InitiateMicroDepositsResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const { provider, merchantId } = await resolveProvider(ctx.tenantId, ctx.locationId);

  // 1. Load the payment method
  const { withTenant } = await import('@oppsera/db');
  const [method] = await withTenant(ctx.tenantId, async (tx) => {
    return tx
      .select()
      .from(customerPaymentMethods)
      .where(
        and(
          eq(customerPaymentMethods.id, paymentMethodId),
          eq(customerPaymentMethods.tenantId, ctx.tenantId),
          eq(customerPaymentMethods.paymentType, 'bank_account'),
          eq(customerPaymentMethods.status, 'active'),
        ),
      )
      .limit(1);
  });

  if (!method) {
    throw new AppError('PAYMENT_METHOD_NOT_FOUND', 'Bank account not found', 404);
  }

  if (method.verificationStatus === 'verified') {
    throw new AppError('ALREADY_VERIFIED', 'This bank account is already verified', 409);
  }

  if (method.verificationStatus === 'pending_micro') {
    throw new AppError('VERIFICATION_PENDING', 'Micro-deposit verification is already pending', 409);
  }

  // 2. Generate two random amounts (1-99 cents each)
  const amount1Cents = Math.floor(Math.random() * 99) + 1;
  const amount2Cents = Math.floor(Math.random() * 99) + 1;

  // 3. Send micro-deposits via CardPointe (two small ACH credits)
  const token = method.token;
  if (!token) {
    throw new AppError('NO_TOKEN', 'Payment method has no stored token', 422);
  }

  // Send deposit 1
  await provider.sale({
    merchantId,
    amount: centsToDollars(amount1Cents),
    currency: 'USD',
    token,
    orderId: `MICRO1-${paymentMethodId.slice(0, 10)}`,
    capture: 'Y',
    ecomind: 'E',
    achAccountType: method.bankAccountType === 'checking' ? 'ECHK' : 'ESAV',
    achSecCode: 'WEB',
    achDescription: 'Verification',
  });

  // Send deposit 2
  await provider.sale({
    merchantId,
    amount: centsToDollars(amount2Cents),
    currency: 'USD',
    token,
    orderId: `MICRO2-${paymentMethodId.slice(0, 10)}`,
    capture: 'Y',
    ecomind: 'E',
    achAccountType: method.bankAccountType === 'checking' ? 'ECHK' : 'ESAV',
    achSecCode: 'WEB',
    achDescription: 'Verification',
  });

  // 4. Store micro-deposit record and update verification status
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 5); // 5 business day expiry

  const result = await publishWithOutbox(ctx, async (tx) => {
    const [deposit] = await tx
      .insert(achMicroDeposits)
      .values({
        tenantId: ctx.tenantId,
        customerId: method.customerId,
        paymentMethodId,
        amount1Cents,
        amount2Cents,
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        expiresAt,
      })
      .returning();

    await tx
      .update(customerPaymentMethods)
      .set({
        verificationStatus: 'pending_micro',
        updatedAt: new Date(),
      })
      .where(eq(customerPaymentMethods.id, paymentMethodId));

    return {
      result: {
        microDepositId: deposit!.id,
        paymentMethodId,
        expiresAt,
      } satisfies InitiateMicroDepositsResult,
      events: [],
    };
  });

  await auditLog(ctx, 'payment.micro_deposit.initiated', 'customer_payment_method', paymentMethodId);
  return result;
}
