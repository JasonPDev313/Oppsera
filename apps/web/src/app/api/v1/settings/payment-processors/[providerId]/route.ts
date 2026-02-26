import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateProvider, updateProviderSchema } from '@oppsera/module-payments';

function extractProviderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.indexOf('payment-processors') + 1]!;
}

/**
 * PATCH /api/v1/settings/payment-processors/:providerId
 * Update provider display name, active status, or config.
 */
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const providerId = extractProviderId(request);
    const body = await request.json();
    const parsed = updateProviderSchema.safeParse({ ...body, providerId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateProvider(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'settings.update', writeAccess: true },
);
