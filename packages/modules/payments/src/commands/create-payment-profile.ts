import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { customerPaymentMethods } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import type { CreatePaymentProfileInput } from '../gateway-validation';
import type { PaymentProfileResult } from '../types/gateway-results';
import { PAYMENT_GATEWAY_EVENTS } from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';
import { extractCardLast4, detectCardBrand } from '../helpers/amount';

/**
 * Create a stored payment profile on the provider (e.g., CardPointe).
 * Stores the profile reference in customer_payment_methods.
 */
export async function createPaymentProfile(
  ctx: RequestContext,
  input: CreatePaymentProfileInput,
): Promise<PaymentProfileResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const { provider, merchantId } = await resolveProvider(ctx.tenantId, ctx.locationId);

  // 1. Create profile on provider
  const profileResult = await provider.createProfile({
    merchantId,
    token: input.token,
    expiry: input.expiry,
    name: input.name,
    address: input.address,
    postal: input.postal,
  });

  // 2. Parse expiry
  const expiryMonth = input.expiry ? parseInt(input.expiry.slice(0, 2), 10) : null;
  const expiryYear = input.expiry
    ? 2000 + parseInt(input.expiry.slice(2, 4), 10)
    : null;

  const cardLast4 = profileResult.cardLast4 ?? extractCardLast4(input.token);
  const cardBrand = profileResult.cardBrand ?? detectCardBrand(input.token);

  // 3. Store in customer_payment_methods (uses correct column names from schema)
  const result = await publishWithOutbox(ctx, async (tx) => {
    // If isDefault, clear existing defaults
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
        paymentType: 'card', // schema column name
        token: profileResult.token,
        last4: cardLast4, // schema column name
        brand: cardBrand, // schema column name
        expiryMonth,
        expiryYear,
        isDefault: input.isDefault ?? false,
        nickname: input.nickname ?? null,
        providerProfileId: profileResult.profileId,
        providerAccountId: profileResult.accountId,
        billingAddress: input.address
          ? { address: input.address, postal: input.postal, name: input.name }
          : null,
      })
      .returning();

    const event = buildEventFromContext(ctx, PAYMENT_GATEWAY_EVENTS.PROFILE_CREATED, {
      tenantId: ctx.tenantId,
      customerId: input.customerId,
      paymentMethodId: method!.id,
      providerProfileId: profileResult.profileId,
      cardLast4,
      cardBrand,
    });

    return {
      result: {
        paymentMethodId: method!.id,
        providerProfileId: profileResult.profileId,
        providerAccountId: profileResult.accountId,
        cardLast4,
        cardBrand,
        customerId: input.customerId,
      } as PaymentProfileResult,
      events: [event],
    };
  });

  await auditLog(ctx, 'payment.profile.created', 'customer_payment_method', result.paymentMethodId);
  return result;
}
