import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateMerchantAccount,
  updateMerchantAccountSchema,
} from '@oppsera/module-payments';

function extractIds(request: NextRequest): { providerId: string; accountId: string } {
  const parts = new URL(request.url).pathname.split('/');
  const providerId = parts[parts.indexOf('payment-processors') + 1]!;
  const accountId = parts[parts.indexOf('merchant-accounts') + 1]!;
  return { providerId, accountId };
}

/**
 * PATCH /api/v1/settings/payment-processors/:providerId/merchant-accounts/:accountId
 * Update a merchant account (MID).
 */
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { accountId } = extractIds(request);
    const body = await request.json();
    const parsed = updateMerchantAccountSchema.safeParse({ ...body, merchantAccountId: accountId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateMerchantAccount(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'settings.manage', writeAccess: true },
);

/**
 * DELETE /api/v1/settings/payment-processors/:providerId/merchant-accounts/:accountId
 * Deactivate a merchant account (soft delete).
 */
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { accountId } = extractIds(request);
    const result = await updateMerchantAccount(ctx, {
      merchantAccountId: accountId,
      isActive: false,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'settings.manage', writeAccess: true },
);
