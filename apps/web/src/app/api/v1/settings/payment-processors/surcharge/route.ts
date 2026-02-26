import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listSurchargeSettings,
  saveSurchargeSettings,
  saveSurchargeSettingsSchema,
} from '@oppsera/module-payments';

/**
 * GET /api/v1/settings/payment-processors/surcharge
 * List all surcharge settings for the tenant.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId') ?? undefined;
    const settings = await listSurchargeSettings(ctx.tenantId, providerId);
    return NextResponse.json({ data: settings });
  },
  { entitlement: 'payments', permission: 'settings.view' },
);

/**
 * POST /api/v1/settings/payment-processors/surcharge
 * Save (upsert) surcharge settings at tenant/location/terminal level.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = saveSurchargeSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await saveSurchargeSettings(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'payments', permission: 'settings.update', writeAccess: true },
);
