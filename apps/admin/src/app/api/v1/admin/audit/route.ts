import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/admin/audit — Platform admin audit log (enhanced) ──

export const GET = withAdminPermission(
  async (req) => {
    const sp = new URL(req.url).searchParams;

    const actorAdminId = sp.get('actor_admin_id') ?? undefined;
    const action = sp.get('action') ?? undefined;
    const actionPrefix = sp.get('action_prefix') ?? undefined;
    const entityType = sp.get('entity_type') ?? undefined;
    const entityId = sp.get('entity_id') ?? undefined;
    const tenantId = sp.get('tenant_id') ?? undefined;
    const dateFrom = sp.get('date_from') ?? undefined;
    const dateTo = sp.get('date_to') ?? undefined;
    const hasReason = sp.get('has_reason') ?? undefined;
    const sortDir = sp.get('sort_dir') === 'asc' ? 'ASC' : 'DESC';
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const limit = Math.min(200, Math.max(1, Number(sp.get('limit') ?? '50')));
    const offset = (page - 1) * limit;

    const result = await withAdminDb(async (tx) => {
      const conditions: ReturnType<typeof sql>[] = [];

      if (actorAdminId) {
        conditions.push(sql`al.actor_admin_id = ${actorAdminId}`);
      }
      if (action) {
        conditions.push(sql`al.action = ${action}`);
      }
      if (actionPrefix) {
        conditions.push(sql`al.action LIKE ${actionPrefix.replace('*', '%')}`);
      }
      if (entityType) {
        conditions.push(sql`al.entity_type = ${entityType}`);
      }
      if (entityId) {
        conditions.push(sql`al.entity_id = ${entityId}`);
      }
      if (tenantId) {
        conditions.push(sql`al.tenant_id = ${tenantId}`);
      }
      if (dateFrom) {
        conditions.push(sql`al.created_at >= ${dateFrom}::timestamptz`);
      }
      if (dateTo) {
        conditions.push(sql`al.created_at <= ${dateTo}::timestamptz`);
      }
      if (hasReason === 'true') {
        conditions.push(sql`al.reason IS NOT NULL AND al.reason != ''`);
      }

      const whereClause =
        conditions.length > 0
          ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
          : sql``;

      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM platform_admin_audit_log al
        ${whereClause}
      `);
      const total = Number(Array.from(countResult as Iterable<{ total: number }>)[0]?.total ?? 0);

      const rows = await tx.execute(sql`
        SELECT
          al.id,
          al.actor_admin_id,
          pa.name AS actor_admin_name,
          pa.email AS actor_admin_email,
          al.action,
          al.entity_type,
          al.entity_id,
          al.tenant_id,
          t.name AS tenant_name,
          al.before_snapshot,
          al.after_snapshot,
          al.reason,
          al.ip_address,
          al.metadata,
          al.created_at
        FROM platform_admin_audit_log al
        LEFT JOIN platform_admins pa ON pa.id = al.actor_admin_id
        LEFT JOIN tenants t ON t.id = al.tenant_id
        ${whereClause}
        ORDER BY al.created_at ${sql.raw(sortDir)}
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        actorAdminId: r.actor_admin_id as string,
        actorAdminName: r.actor_admin_name as string | null,
        actorAdminEmail: r.actor_admin_email as string | null,
        action: r.action as string,
        entityType: r.entity_type as string,
        entityId: r.entity_id as string,
        tenantId: r.tenant_id as string | null,
        tenantName: r.tenant_name as string | null,
        beforeSnapshot: r.before_snapshot as Record<string, unknown> | null,
        afterSnapshot: r.after_snapshot as Record<string, unknown> | null,
        reason: r.reason as string | null,
        ipAddress: r.ip_address as string | null,
        metadata: r.metadata as Record<string, unknown> | null,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      }));

      return { items, total, page, limit };
    });

    return NextResponse.json({ data: result });
  },
  { permission: 'system.view' },
);
