import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getHostSettings,
  updateHostSettings,
  updateHostSettingsSchema,
} from '@oppsera/module-fnb';

export const GET = withMiddleware(
  async (req: NextRequest, ctx: any) => {
    const url = new URL(req.url);
    const locationId = url.searchParams.get('locationId') || ctx.locationId;

    const data = await getHostSettings({
      tenantId: ctx.tenantId,
      locationId,
    });

    return NextResponse.json({ data });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.view' },
);

export const PATCH = withMiddleware(
  async (req: NextRequest, ctx: any) => {
    const body = await req.json();
    const parsed = updateHostSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid host settings',
        parsed.error.issues,
      );
    }

    const result = await updateHostSettings(ctx, parsed.data);

    return NextResponse.json({ data: result });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.floor_plan.manage',
    writeAccess: true,
  },
);
