import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getGlobalMetrics, getTenantMetrics } from '@oppsera/module-semantic/observability';
import { getQueryCacheStats } from '@oppsera/module-semantic/cache';

// ── GET /api/v1/semantic/admin/metrics ────────────────────────────
// Returns in-memory observability metrics for the semantic layer.
// Shows global aggregates, per-tenant breakdowns, and cache stats.
//
// Query params:
//   ?tenantId=xxx  — narrow to a specific tenant
//   ?topN=10       — number of top tenants to include (default 10)
//
// Access: requires 'semantic.admin' permission.

export const GET = withMiddleware(
  async (request: NextRequest, _ctx) => {
    const url = new URL(request.url);
    const targetTenantId = url.searchParams.get('tenantId') ?? undefined;
    const topN = Math.min(50, parseInt(url.searchParams.get('topN') ?? '10', 10));

    const cacheStats = getQueryCacheStats();

    if (targetTenantId) {
      const tenantMetrics = getTenantMetrics(targetTenantId);
      return NextResponse.json({
        data: {
          tenant: tenantMetrics ?? { tenantId: targetTenantId, totalRequests: 0 },
          queryCache: cacheStats,
          collectedAt: new Date().toISOString(),
        },
      });
    }

    const global = getGlobalMetrics(topN);

    return NextResponse.json({
      data: {
        global,
        queryCache: cacheStats,
        collectedAt: new Date().toISOString(),
      },
    });
  },
  {
    entitlement: 'semantic',
    permission: 'semantic.admin',
  },
);
