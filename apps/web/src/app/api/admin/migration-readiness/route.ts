/**
 * Migration Readiness Dashboard
 *
 * GET /api/admin/migration-readiness
 *
 * Platform admin only. Checks current system metrics against migration
 * trigger thresholds and returns a readiness assessment.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core';
import { checkMigrationTriggers } from '@oppsera/core/observability/migration-triggers';

export const dynamic = 'force-dynamic';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin only' } },
        { status: 403 },
      );
    }

    const triggers = await checkMigrationTriggers();

    const triggered = triggers.filter(t => t.status === 'triggered');
    const warnings = triggers.filter(t => t.status === 'warning');

    const overallStatus = triggered.length > 0
      ? 'migration-recommended'
      : warnings.length > 0
      ? 'monitor-closely'
      : 'healthy-on-vercel';

    return NextResponse.json({
      data: {
        overallStatus,
        summary: {
          total: triggers.length,
          ok: triggers.filter(t => t.status === 'ok').length,
          warning: warnings.length,
          triggered: triggered.length,
        },
        triggers,
        recommendation: triggered.length > 0
          ? `${triggered.length} migration trigger(s) hit. Review: ${triggered.map(t => t.id).join(', ')}`
          : warnings.length > 0
          ? `${warnings.length} metric(s) approaching threshold. Monitor weekly.`
          : 'All metrics healthy. No migration needed at current scale.',
        migrationOrder: [
          '1. Database (Supabase → RDS) — biggest cost savings, lowest code change',
          '2. Workers (outbox → dedicated container) — enables long-running jobs',
          '3. API (Vercel → ECS) — only when cold starts / concurrency are unacceptable',
          '4. Auth (Supabase Auth → self-hosted) — LAST, only if forced',
        ],
        timestamp: new Date().toISOString(),
      },
    });
  },
  { permission: 'platform.admin' },
);
