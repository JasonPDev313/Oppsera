import { publishWithOutbox } from '@oppsera/core/events/publish-with-outbox';
import { buildEventFromContext } from '@oppsera/core/events/build-event';
import { auditLog } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { customerPaymentMethods } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { PaymentProfileResult } from '../types/gateway-results';
import { PAYMENT_GATEWAY_EVENTS } from '../events/gateway-types';
import { resolveProvider } from '../helpers/resolve-provider';
import { extractCardLast4, detectCardBrand } from '../helpers/amount';

export const addPaymentMethodSchema = z.object({
  clientRequestId: z.string().min(1).max(128),
  customerId: z.string().min(1),
  token: z.string().min(1),
  expiry: z.string().regex(/^\d{4}$/, 'MMYY format'),
  name: z.string().max(100).optional(),
  address: z.string().max(200).optional(),
  postal: z.string().max(20).optional(),
  nickname: z.string().max(50).optional(),
  isDefault: z.boolean().default(false),
});
export type AddPaymentMethodInput = z.input<typeof addPaymentMethodSchema>;

/**
 * Add a second (or subsequent) card to an existing customer profile.
 * Looks up the existing CardPointe profileid and uses profileupdate='Y'.
 */
export async function addPaymentMethod(
  ctx: RequestContext,
  input: AddPaymentMethodInput,
): Promise<PaymentProfileResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const { provider, merchantId } = await resolveProvider(ctx.tenantId, ctx.locationId);

  // 1. Find existing profile for this customer
  const existingMethods = await (await import('@oppsera/db')).withTenant(ctx.tenantId, async (tx) => {
    return tx
      .select({
        providerProfileId: customerPaymentMethods.providerProfileId,
      })
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

  // 2. Create profile on provider (with profileupdate if existing)
  const profileResult = await provider.createProfile({
    merchantId,
    token: input.token,
    expiry: input.expiry,
    name: input.name,
    address: input.address,
    postal: input.postal,
    ...(existingProfileId
      ? { profileUpdate: 'Y' as const, existingProfileId }
      : {}),
  });

  // 3. Parse expiry
  const expiryMonth = input.expiry ? parseInt(input.expiry.slice(0, 2), 10) : null;
  const expiryYear = input.expiry
    ? 2000 + parseInt(input.expiry.slice(2, 4), 10)
    : null;

  const cardLast4 = profileResult.cardLast4 ?? extractCardLast4(input.token);
  const cardBrand = profileResult.cardBrand ?? detectCardBrand(input.token);

  // 4. Store in customer_payment_methods
  const result = await publishWithOutbox(ctx, async (tx) => {
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
        paymentType: 'card',
        token: profileResult.token,
        last4: cardLast4,
        brand: cardBrand,
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

  await auditLog(ctx, 'payment.method.added', 'customer_payment_method', result.paymentMethodId);
  return result;
}
