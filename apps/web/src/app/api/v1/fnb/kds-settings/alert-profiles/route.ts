import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listAlertProfiles,
  upsertAlertProfile,
  createAlertProfileSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-settings/alert-profiles — list alert profiles
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const profiles = await listAlertProfiles({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
    });
    return NextResponse.json({ data: profiles });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// POST /api/v1/fnb/kds-settings/alert-profiles — create alert profile
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createAlertProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const profile = await upsertAlertProfile(ctx, parsed.data);
    return NextResponse.json({ data: profile }, { status: 201 });
  },
  { entitlement: 'kds', permission: 'kds.settings.manage', writeAccess: true },
);
