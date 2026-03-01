import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getSpaSettings,
  updateSpaSettings,
  updateSpaSettingsSchema,
} from '@oppsera/module-spa';

// GET /api/v1/spa/settings — get spa settings for the current tenant
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const settings = await getSpaSettings(ctx.tenantId, ctx.locationId ?? undefined);

    return NextResponse.json({ data: settings });
  },
  { entitlement: 'spa', permission: 'spa.settings.view' },
);

// PATCH /api/v1/spa/settings — update spa settings
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = updateSpaSettingsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const settings = await updateSpaSettings(ctx, parsed.data);
    return NextResponse.json({ data: settings });
  },
  { entitlement: 'spa', permission: 'spa.settings.manage', writeAccess: true },
);
