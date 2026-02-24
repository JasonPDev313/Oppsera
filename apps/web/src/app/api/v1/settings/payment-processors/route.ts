import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listPaymentProviders,
  createProvider,
  createProviderSchema,
} from '@oppsera/module-payments';

/**
 * GET /api/v1/settings/payment-processors
 * List all payment providers for the tenant.
 */
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const providers = await listPaymentProviders(ctx.tenantId);
    return NextResponse.json({ data: providers });
  },
  { entitlement: 'payments', permission: 'settings.view' },
);

/**
 * POST /api/v1/settings/payment-processors
 * Create a new payment provider (e.g., CardPointe).
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createProviderSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await createProvider(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'settings.manage', writeAccess: true },
);
