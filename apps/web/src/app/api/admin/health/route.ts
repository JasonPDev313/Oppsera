/**
 * Admin health check — runs full database + job health diagnostics.
 *
 * GET /api/admin/health
 *
 * Platform admin only. Returns DB health snapshot, job health,
 * and writes results to system_health_snapshots for trend analysis.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core';
import { dbHealth, jobHealth, sendAlert, logger } from '@oppsera/core/observability';
import { db, sql } from '@oppsera/db';

export const dynamic = 'force-dynamic';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    if (!ctx.isPlatformAdmin) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Platform admin only' } },
        { status: 403 },
      );
    }

    // Run all health checks in parallel
    const [dbSnapshot, jobStatus] = await Promise.all([
      dbHealth.fullSnapshot(),
      jobHealth.runHealthCheck(),
    ]);

    // Persist snapshot to system_health_snapshots table
    try {
      await db.execute(sql`
        INSERT INTO system_health_snapshots (
          captured_at,
          connection_count,
          max_connections,
          connection_util_pct,
          cache_hit_pct,
          top_tables,
          bloat_report,
          slow_queries,
          seq_scan_report,
          alerts
        ) VALUES (
          NOW(),
          ${dbSnapshot.connections.totalActive},
          ${Number(dbSnapshot.connections.maxConnections)},
          ${dbSnapshot.connections.utilizationPct},
          ${Number(dbSnapshot.cacheHit.cacheHitPct) || null},
          ${JSON.stringify(dbSnapshot.tableSizes)}::jsonb,
          ${JSON.stringify(dbSnapshot.tableBloat)}::jsonb,
          ${JSON.stringify(dbSnapshot.worstOffenders)}::jsonb,
          ${JSON.stringify(dbSnapshot.sequentialScans)}::jsonb,
          ${JSON.stringify(dbSnapshot.alerts)}::jsonb
        )
      `);
    } catch (err) {
      logger.error('Failed to persist health snapshot', {
        error: { message: err instanceof Error ? err.message : String(err) },
      });
    }

    // Send alerts if any thresholds crossed
    for (const alert of dbSnapshot.alerts) {
      await sendAlert({
        level: alert.level === 'critical' ? 'P0' : 'P1',
        title: `Database: ${alert.metric}`,
        details: alert.message,
      });
    }

    return NextResponse.json({
      data: {
        database: dbSnapshot,
        jobs: jobStatus,
        timestamp: new Date().toISOString(),
      },
    });
  },
  { permission: 'platform.admin' },
);
