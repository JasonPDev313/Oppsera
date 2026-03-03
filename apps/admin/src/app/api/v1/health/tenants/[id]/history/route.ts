import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { sql } from '@oppsera/db';
import { withAdminDb } from '@/lib/admin-db';

// ── GET /api/v1/health/tenants/[id]/history — 7-day snapshot history ──

export const GET = withAdminPermission(async (_req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Missing tenant ID' } },
      { status: 400 },
    );
  }

  const data = await withAdminDb(async (tx) => {
    const ts = (v: unknown) =>
      v instanceof Date ? v.toISOString() : v ? String(v) : null;

    // Verify tenant exists
    const tenantRows = await tx.execute(sql`
      SELECT id, name FROM tenants WHERE id = ${tenantId}
    `);
    const tenantItems = Array.from(tenantRows as Iterable<Record<string, unknown>>);
    if (tenantItems.length === 0) {
      return null;
    }
    const tenant = tenantItems[0]!;

    // Last 7 days of snapshots ordered ASC for charting
    const rows = await tx.execute(sql`
      SELECT
        id, tenant_id, captured_at,
        orders_24h, active_users_24h,
        last_order_at, last_login_at,
        error_count_24h, error_count_1h,
        dlq_depth, dlq_unresolved_over_24h,
        background_job_failures_24h, integration_error_count_24h,
        unposted_gl_entries, unmapped_gl_events, open_close_batches,
        health_score, health_grade, grade_factors
      FROM tenant_health_snapshots
      WHERE tenant_id = ${tenantId}
        AND captured_at > NOW() - INTERVAL '7 days'
      ORDER BY captured_at ASC
    `);

    const snapshots = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      tenantId: r.tenant_id as string,
      capturedAt: ts(r.captured_at),
      orders24h: Number(r.orders_24h ?? 0),
      activeUsers24h: Number(r.active_users_24h ?? 0),
      lastOrderAt: ts(r.last_order_at),
      lastLoginAt: ts(r.last_login_at),
      errorCount24h: Number(r.error_count_24h ?? 0),
      errorCount1h: Number(r.error_count_1h ?? 0),
      dlqDepth: Number(r.dlq_depth ?? 0),
      dlqUnresolvedOver24h: Number(r.dlq_unresolved_over_24h ?? 0),
      backgroundJobFailures24h: Number(r.background_job_failures_24h ?? 0),
      integrationErrorCount24h: Number(r.integration_error_count_24h ?? 0),
      unpostedGlEntries: Number(r.unposted_gl_entries ?? 0),
      unmappedGlEvents: Number(r.unmapped_gl_events ?? 0),
      openCloseBatches: Number(r.open_close_batches ?? 0),
      healthScore: Number(r.health_score ?? 100),
      healthGrade: r.health_grade as string,
      gradeFactors: r.grade_factors as unknown[],
    }));

    return {
      tenantId: tenant.id as string,
      tenantName: tenant.name as string,
      snapshots,
    };
  });

  if (!data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Tenant not found' } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data });
}, { permission: 'tenants.read' });
