import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getManageTabsSettings,
  updateManageTabsSettings,
  manageTabsSettingsSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/tabs/manage/settings
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const settings = await getManageTabsSettings(ctx.tenantId, ctx.locationId ?? null);
    return NextResponse.json({ data: settings });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.view' },
);

// PATCH /api/v1/fnb/tabs/manage/settings
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = manageTabsSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateManageTabsSettings(ctx, {
      ...parsed.data,
      locationId: ctx.locationId ?? null,
    });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage', writeAccess: true },
);
