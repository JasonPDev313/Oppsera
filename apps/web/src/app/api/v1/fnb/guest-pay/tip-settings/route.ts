import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getGuestPayTipSettings,
  updateGuestPayTipSettings,
  updateGuestPayTipSettingsSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/guest-pay/tip-settings
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const locationId = url.searchParams.get('locationId') ?? ctx.locationId ?? '';
    const result = await getGuestPayTipSettings(ctx.tenantId, locationId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.view' },
);

// PATCH /api/v1/fnb/guest-pay/tip-settings
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = updateGuestPayTipSettingsSchema.safeParse({
      ...body,
      locationId: body.locationId ?? ctx.locationId ?? '',
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateGuestPayTipSettings(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage', writeAccess: true },
);
