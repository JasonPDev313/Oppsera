import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSettingsData } from '@oppsera/core/profit-centers';

// GET /api/v1/profit-centers/settings-data
// Returns locations + profit centers + terminals in one call
export const GET = withMiddleware(
  async (_request, ctx) => {
    const data = await getSettingsData(ctx.tenantId);
    return NextResponse.json({ data });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);
