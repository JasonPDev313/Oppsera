import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, tenants } from '@oppsera/db';
import { getGolfDashboardMetrics } from '@oppsera/module-golf-reporting';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    // Only allow golf/hybrid tenants
    const [tenantRow] = await db.select({ businessVertical: tenants.businessVertical }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    const bv = tenantRow?.businessVertical ?? 'general';
    if (bv !== 'golf' && bv !== 'hybrid') {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Golf analytics not available' } }, { status: 404 });
    }

    const url = new URL(request.url);
    const courseId = url.searchParams.get('courseId') ?? undefined;
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? undefined;
    const date = url.searchParams.get('date') ?? undefined;

    const metrics = await getGolfDashboardMetrics({
      tenantId: ctx.tenantId,
      courseId,
      locationId,
      date,
    });

    return NextResponse.json({ data: metrics });
  },
  { entitlement: 'reporting', permission: 'reports.view' },
);
