import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getModuleAnalytics } from '@oppsera/core/usage/queries/get-module-analytics';

// ── GET /api/v1/analytics/modules/[moduleKey] — Module deep-dive ──

export const GET = withAdminPermission(
  async (req) => {
    const url = new URL(req.url);
    const moduleKey = url.pathname.split('/').pop() || '';
    const period = (url.searchParams.get('period') || '30d') as '7d' | '30d';
    const data = await getModuleAnalytics(moduleKey, period);
    return NextResponse.json({ data });
  },
  { permission: 'tenants.detail.view' },
);
