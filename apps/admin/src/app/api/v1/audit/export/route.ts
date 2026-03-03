import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── POST /api/v1/audit/export — Export audit log to CSV ──

export const POST = withAdminPermission(
  async (req) => {
    const body = await req.json();
    const {
      source,
      tenant_id: tenantId,
      filters = {},
      date_from: dateFrom,
      date_to: dateTo,
    } = body as {
      source: 'platform' | 'tenant';
      tenant_id?: string;
      filters?: Record<string, string>;
      date_from: string;
      date_to: string;
    };

    // Validate required fields
    if (!source || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'source, date_from, and date_to are required' } },
        { status: 400 },
      );
    }
    if (source === 'tenant' && !tenantId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'tenant_id is required for tenant export' } },
        { status: 400 },
      );
    }

    // Validate date range (max 90 days)
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > 90) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Date range cannot exceed 90 days' } },
        { status: 400 },
      );
    }
    if (diffDays < 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'date_from must be before date_to' } },
        { status: 400 },
      );
    }

    const csvContent = await withAdminDb(async (tx) => {
      if (source === 'platform') {
        return exportPlatformAudit(tx, dateFrom, dateTo, filters);
      } else {
        return exportTenantAudit(tx, tenantId!, dateFrom, dateTo, filters);
      }
    });

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit_${source}_${dateFrom}_${dateTo}.csv"`,
      },
    });
  },
  { permission: 'system.view' },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exportPlatformAudit(tx: any, dateFrom: string, dateTo: string, filters: Record<string, string>) {
  const conditions: ReturnType<typeof sql>[] = [
    sql`al.created_at >= ${dateFrom}::timestamptz`,
    sql`al.created_at <= ${dateTo}::timestamptz`,
  ];

  if (filters.actor_admin_id) {
    conditions.push(sql`al.actor_admin_id = ${filters.actor_admin_id}`);
  }
  if (filters.action) {
    conditions.push(sql`al.action = ${filters.action}`);
  }
  if (filters.entity_type) {
    conditions.push(sql`al.entity_type = ${filters.entity_type}`);
  }

  const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

  const rows = await tx.execute(sql`
    SELECT
      al.id,
      pa.name AS admin_name,
      pa.email AS admin_email,
      al.action,
      al.entity_type,
      al.entity_id,
      t.name AS tenant_name,
      al.reason,
      al.ip_address,
      al.created_at
    FROM platform_admin_audit_log al
    LEFT JOIN platform_admins pa ON pa.id = al.actor_admin_id
    LEFT JOIN tenants t ON t.id = al.tenant_id
    ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT 50000
  `);

  const items = Array.from(rows as Iterable<Record<string, unknown>>);
  return toCsv(
    ['ID', 'Admin Name', 'Admin Email', 'Action', 'Entity Type', 'Entity ID', 'Tenant', 'Reason', 'IP Address', 'Timestamp'],
    items.map((r) => [
      r.id, r.admin_name, r.admin_email, r.action, r.entity_type,
      r.entity_id, r.tenant_name, r.reason, r.ip_address,
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
    ]),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exportTenantAudit(tx: any, tenantId: string, dateFrom: string, dateTo: string, filters: Record<string, string>) {
  const conditions: ReturnType<typeof sql>[] = [
    sql`al.tenant_id = ${tenantId}`,
    sql`al.created_at >= ${dateFrom}::timestamptz`,
    sql`al.created_at <= ${dateTo}::timestamptz`,
  ];

  if (filters.actor_user_id) {
    conditions.push(sql`al.actor_user_id = ${filters.actor_user_id}`);
  }
  if (filters.action) {
    conditions.push(sql`al.action = ${filters.action}`);
  }
  if (filters.entity_type) {
    conditions.push(sql`al.entity_type = ${filters.entity_type}`);
  }

  const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

  const rows = await tx.execute(sql`
    SELECT
      al.id,
      u.display_name AS actor_name,
      al.actor_type,
      al.action,
      al.entity_type,
      al.entity_id,
      l.name AS location_name,
      al.created_at
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.actor_user_id AND u.tenant_id = ${tenantId}
    LEFT JOIN locations l ON l.id = al.location_id AND l.tenant_id = ${tenantId}
    ${whereClause}
    ORDER BY al.created_at DESC
    LIMIT 50000
  `);

  const items = Array.from(rows as Iterable<Record<string, unknown>>);
  return toCsv(
    ['ID', 'Actor Name', 'Actor Type', 'Action', 'Entity Type', 'Entity ID', 'Location', 'Timestamp'],
    items.map((r) => [
      r.id, r.actor_name, r.actor_type, r.action, r.entity_type,
      r.entity_id, r.location_name,
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
    ]),
  );
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(row.map(escape).join(','));
  }
  return lines.join('\n');
}
