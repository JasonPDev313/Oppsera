import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  listChannelSyncLog,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

// GET /api/v1/pms/channels/[id]/sync-log
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const channelId = segments[segments.length - 2]!;

    const limitStr = url.searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : 50;

    const data = await listChannelSyncLog(ctx.tenantId, channelId, limit);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.CHANNELS_VIEW },
);
