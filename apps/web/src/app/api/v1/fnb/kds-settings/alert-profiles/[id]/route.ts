import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getAlertProfile,
  upsertAlertProfile,
  updateAlertProfileSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/kds-settings/alert-profiles/[id] — get single alert profile
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const profileId = parts[parts.indexOf('alert-profiles') + 1]!;

    const profile = await getAlertProfile({
      tenantId: ctx.tenantId,
      profileId,
    });
    if (!profile) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Alert profile not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: profile });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.view' },
);

// PATCH /api/v1/fnb/kds-settings/alert-profiles/[id] — update alert profile
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const profileId = parts[parts.indexOf('alert-profiles') + 1]!;

    const body = await request.json();
    const parsed = updateAlertProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const profile = await upsertAlertProfile(ctx, { ...parsed.data, profileId } as any);
    return NextResponse.json({ data: profile });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage', writeAccess: true },
);
