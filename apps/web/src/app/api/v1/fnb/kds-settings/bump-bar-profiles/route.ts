import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listBumpBarProfiles,
  upsertBumpBarProfile,
  createBumpBarProfileSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-settings/bump-bar-profiles — list bump bar profiles
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const profiles = await listBumpBarProfiles({
      tenantId: ctx.tenantId,
      locationId: ctx.locationId ?? url.searchParams.get('locationId') ?? undefined,
    });
    return NextResponse.json({ data: profiles });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// POST /api/v1/fnb/kds-settings/bump-bar-profiles — create bump bar profile
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createBumpBarProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const profile = await upsertBumpBarProfile(ctx, parsed.data);
    return NextResponse.json({ data: profile }, { status: 201 });
  },
  { entitlement: 'kds', permission: 'kds.settings.manage', writeAccess: true },
);
