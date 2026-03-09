import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getKdsLocationSettings,
  upsertKdsLocationSettings,
  upsertKdsLocationSettingsSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-settings/location-settings
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = ctx.locationId ?? url.searchParams.get('locationId');
    if (!locationId) {
      return NextResponse.json({ error: { code: 'MISSING_LOCATION', message: 'locationId is required' } }, { status: 400 });
    }
    const settings = await getKdsLocationSettings(ctx.tenantId, locationId);
    return NextResponse.json({ data: settings });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// PATCH /api/v1/fnb/kds-settings/location-settings
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = upsertKdsLocationSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const settings = await upsertKdsLocationSettings(ctx, parsed.data);
    return NextResponse.json({ data: settings });
  },
  { entitlement: 'kds', permission: 'kds.settings.manage', writeAccess: true },
);
