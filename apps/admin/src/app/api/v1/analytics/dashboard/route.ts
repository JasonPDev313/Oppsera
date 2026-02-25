import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getPlatformDashboard } from '@oppsera/core/usage/queries/get-platform-dashboard';

// ── GET /api/v1/analytics/dashboard — Platform usage KPIs + trends ──

export const GET = withAdminPermission(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const period = (params.get('period') || '7d') as '1d' | '7d' | '30d';
    const data = await getPlatformDashboard(period);
    return NextResponse.json({ data });
  },
  { permission: 'tenants.detail.view' },
);
