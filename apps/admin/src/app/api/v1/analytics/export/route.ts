import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/analytics/export — CSV export of usage data ─────

export const GET = withAdminPermission(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const type = params.get('type') || 'daily';
    const days = Number(params.get('days') || 30);
    const tenantId = params.get('tenantId') || null;

    let csvContent = '';

    if (type === 'daily') {
      const conditions = [sql`usage_date >= CURRENT_DATE - ${days}::int`];
      if (tenantId) conditions.push(sql`tenant_id = ${tenantId}`);

      const rows = await db.execute(sql`
        SELECT
          tenant_id, module_key, usage_date::text,
          request_count, write_count, read_count, error_count,
          unique_users, total_duration_ms, max_duration_ms, avg_duration_ms
        FROM rm_usage_daily
        WHERE ${sql.join(conditions, sql` AND `)}
        ORDER BY usage_date DESC, tenant_id, module_key
      `);

      const headers = [
        'tenant_id', 'module_key', 'usage_date',
        'request_count', 'write_count', 'read_count', 'error_count',
        'unique_users', 'total_duration_ms', 'max_duration_ms', 'avg_duration_ms',
      ];
      csvContent = '\uFEFF' + headers.join(',') + '\n';
      for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
        csvContent += headers.map((h) => escapeCsv(String(r[h] ?? ''))).join(',') + '\n';
      }
    } else if (type === 'workflow') {
      const conditions = [sql`usage_date >= CURRENT_DATE - ${days}::int`];
      if (tenantId) conditions.push(sql`tenant_id = ${tenantId}`);

      const rows = await db.execute(sql`
        SELECT
          tenant_id, module_key, workflow_key, usage_date::text,
          request_count, error_count, unique_users
        FROM rm_usage_workflow_daily
        WHERE ${sql.join(conditions, sql` AND `)}
        ORDER BY usage_date DESC, tenant_id, module_key
      `);

      const headers = [
        'tenant_id', 'module_key', 'workflow_key', 'usage_date',
        'request_count', 'error_count', 'unique_users',
      ];
      csvContent = '\uFEFF' + headers.join(',') + '\n';
      for (const r of Array.from(rows as Iterable<Record<string, unknown>>)) {
        csvContent += headers.map((h) => escapeCsv(String(r[h] ?? ''))).join(',') + '\n';
      }
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="usage_${type}_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  },
  { permission: 'tenants.detail.view' },
);

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
