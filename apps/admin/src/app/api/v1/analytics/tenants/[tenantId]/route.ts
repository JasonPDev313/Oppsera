import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getTenantUsage } from '@oppsera/core/usage/queries/get-tenant-usage';

// ── GET /api/v1/analytics/tenants/[tenantId] — Tenant usage breakdown ──

export const GET = withAdminPermission(
  async (req) => {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const tenantId = segments[segments.indexOf('tenants') + 1] || '';
    const period = (url.searchParams.get('period') || '30d') as '7d' | '30d';
    const data = await getTenantUsage(tenantId, period);
    return NextResponse.json({ data });
  },
  { permission: 'tenants.detail.view' },
);
