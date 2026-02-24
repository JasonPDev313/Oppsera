import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { customerPaymentMethods } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { AddBankAccountInput } from '../gateway-validation';
import { PAYMENT_GATEWAY_EVENTS } from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';

export interface BankAccountResult {
  paymentMethodId: string;
  providerProfileId: string;
  providerAccountId: string;
  bankLast4: string;
  bankAccountType: string;
  verificationStatus: string;
  customerId: string;
}

/**
 * Add a bank account to a customer profile.
 * Creates a CardPointe profile with the ACH token.
 * Sets verification_status based on merchant account settings.
 */
export async function addBankAccount(
  ctx: RequestContext,
  input: AddBankAccountInput,
): Promise<BankAccountResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const { provider, merchantId } = await resolveProvider(ctx.tenantId, ctx.locationId);

  // 1. Find existing profile for this customer (reuse if exists)
  const { withTenant } = await import('@oppsera/db');
  const existingMethods = await withTenant(ctx.tenantId, async (tx) => {
    return tx
      .select({ providerProfileId: customerPaymentMethods.providerProfileId })
      .from(customerPaymentMethods)
      .where(
        and(
          eq(customerPaymentMethods.tenantId, ctx.tenantId),
          eq(customerPaymentMethods.customerId, input.customerId),
          eq(customerPaymentMethods.status, 'active'),
        ),
      )
      .limit(1);
  });

  const existingProfileId = existingMethods[0]?.providerProfileId ?? undefined;

  // 2. Create profile on provider (ACH tokens work with same profile endpoint)
  const profileResult = await provider.createProfile({
    merchantId,
    token: input.token,
    expiry: '9999', // ACH has no expiry — use placeholder
    ...(existingProfileId
      ? { profileUpdate: 'Y' as const, existingProfileId }
      : {}),
  });

  // 3. Determine initial verification status
  const verificationStatus = input.skipVerification ? 'verified' : 'unverified';

  // 4. Store in customer_payment_methods
  const result = await publishWithOutbox(ctx, async (tx) => {
    // Clear other defaults if this is being set as default
    if (input.isDefault) {
      await tx
        .update(customerPaymentMethods)
        .set({ isDefault: false })
        .where(
          and(
            eq(customerPaymentMethods.tenantId, ctx.tenantId),
            eq(customerPaymentMethods.customerId, input.customerId),
            eq(customerPaymentMethods.isDefault, true),
          ),
        );
    }

    const [method] = await tx
      .insert(customerPaymentMethods)
      .values({
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        paymentType: 'bank_account',
        token: profileResult.token,
        last4: input.accountLast4,
        brand: null, // no brand for bank accounts
        expiryMonth: null,
        expiryYear: null,
        isDefault: input.isDefault ?? false,
        nickname: input.nickname ?? null,
        providerProfileId: profileResult.profileId,
        providerAccountId: profileResult.accountId,
        billingAddress: null,
        // ACH-specific fields
        bankRoutingLast4: input.routingLast4,
        bankAccountType: input.accountType,
        bankName: input.bankName ?? null,
        verificationStatus,
        verificationAttempts: 0,
      })
      .returning();

    const event = buildEventFromContext(ctx, PAYMENT_GATEWAY_EVENTS.PROFILE_CREATED, {
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      paymentMethodId: method!.id,
      providerProfileId: profileResult.profileId,
      cardLast4: null, // not a card
      cardBrand: null,
    });

    return {
      result: {
        paymentMethodId: method!.id,
        providerProfileId: profileResult.profileId,
        providerAccountId: profileResult.accountId,
        bankLast4: input.accountLast4,
        bankAccountType: input.accountType,
        verificationStatus,
        customerId: input.customerId,
      } satisfies BankAccountResult,
      events: [event],
    };
  });

  await auditLog(ctx, 'payment.bank_account.added', 'customer_payment_method', result.paymentMethodId);
  return result;
}
