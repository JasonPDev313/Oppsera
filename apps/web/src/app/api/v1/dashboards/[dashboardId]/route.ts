import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { getDashboard, saveDashboard, deleteDashboard } from '@oppsera/module-reporting';

function extractDashboardId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/dashboards/{dashboardId} → last segment
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const dashboardId = extractDashboardId(request);
    const dashboard = await getDashboard(ctx.tenantId, dashboardId);
    if (!dashboard) {
      throw new AppError('NOT_FOUND', 'Dashboard not found', 404);
    }
    return NextResponse.json({ data: dashboard });
  },
  { entitlement: 'reporting', permission: 'reports.custom.view' },
);

export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const dashboardId = extractDashboardId(request);
    const body = await request.json();

    if (!body.name || !body.tiles) {
      throw new AppError('VALIDATION_ERROR', 'name and tiles are required', 400);
    }

    const result = await saveDashboard(ctx, {
      id: dashboardId,
      name: body.name,
      description: body.description,
      tiles: body.tiles,
      isDefault: body.isDefault,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'reporting', permission: 'reports.custom.manage', writeAccess: true },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const dashboardId = extractDashboardId(request);
    await deleteDashboard(ctx, dashboardId);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'reporting', permission: 'reports.custom.manage' , writeAccess: true },
);
