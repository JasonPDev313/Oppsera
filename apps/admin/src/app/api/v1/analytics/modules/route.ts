import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getPlatformDashboard } from '@oppsera/core/usage/queries/get-platform-dashboard';

// ── GET /api/v1/analytics/modules — Module ranking + adoption ───

export const GET = withAdminPermission(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const period = (params.get('period') || '30d') as '1d' | '7d' | '30d';
    const data = await getPlatformDashboard(period);
    return NextResponse.json({
      data: {
        moduleRanking: data.moduleRanking,
        adoptionRates: data.adoptionRates,
      },
    });
  },
  { permission: 'tenants.detail.view' },
);
