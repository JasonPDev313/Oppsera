import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getWaitlistStats } from '@oppsera/module-spa';

// GET /api/v1/spa/waitlist/stats — waitlist statistics for dashboard
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get('serviceId') ?? undefined;

    const stats = await getWaitlistStats({
      tenantId: ctx.tenantId,
      serviceId,
    });

    return NextResponse.json({ data: stats });
  },
  { entitlement: 'spa', permission: 'spa.waitlist.view' },
);
