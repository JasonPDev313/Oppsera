import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { invalidateRegistryCache } from '@oppsera/module-semantic/registry';
import { invalidateQueryCache } from '@oppsera/module-semantic/cache';

// ── POST /api/v1/semantic/admin/invalidate ────────────────────────
// Flushes the in-memory registry cache and/or query result cache.
// Useful after syncing new registry data or debugging stale results.
//
// Body (optional):
//   { scope: 'registry' | 'queries' | 'all', tenantId?: string }
//
// Access: requires 'semantic.admin' permission.

export const POST = withMiddleware(
  async (request: NextRequest, _ctx) => {
    let scope: string = 'all';
    let tenantId: string | undefined;

    try {
      const body = await request.json();
      scope = body?.scope ?? 'all';
      tenantId = body?.tenantId;
    } catch {
      // No body — default to 'all'
    }

    const results: Record<string, number | string> = {};

    if (scope === 'registry' || scope === 'all') {
      invalidateRegistryCache();
      results.registry = 'invalidated';
    }

    if (scope === 'queries' || scope === 'all') {
      const evicted = invalidateQueryCache(tenantId);
      results.queryCacheEvicted = evicted;
      if (tenantId) results.tenantId = tenantId;
    }

    return NextResponse.json({
      data: {
        scope,
        ...results,
        invalidatedAt: new Date().toISOString(),
      },
    });
  },
  {
    entitlement: 'semantic',
    permission: 'semantic.admin',
  },
);
