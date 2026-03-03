import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/audit/tenant/[tenantId] — Tenant-level audit log ──

export const GET = withAdminPermission(
  async (req, _session, params) => {
    const tenantId = params?.tenantId;
    if (!tenantId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'tenantId is required' } },
        { status: 400 },
      );
    }

    const sp = new URL(req.url).searchParams;
    const actorUserId = sp.get('actor_user_id') ?? undefined;
    const actorType = sp.get('actor_type') ?? undefined;
    const action = sp.get('action') ?? undefined;
    const entityType = sp.get('entity_type') ?? undefined;
    const entityId = sp.get('entity_id') ?? undefined;
    const locationId = sp.get('location_id') ?? undefined;
    const dateFrom = sp.get('date_from') ?? undefined;
    const dateTo = sp.get('date_to') ?? undefined;
    const page = Math.max(1, Number(sp.get('page') ?? '1'));
    const limit = Math.min(200, Math.max(1, Number(sp.get('limit') ?? '50')));
    const offset = (page - 1) * limit;

    const result = await withAdminDb(async (tx) => {
      const conditions: ReturnType<typeof sql>[] = [
        sql`al.tenant_id = ${tenantId}`,
      ];

      if (actorUserId) {
        conditions.push(sql`al.actor_user_id = ${actorUserId}`);
      }
      if (actorType) {
        conditions.push(sql`al.actor_type = ${actorType}`);
      }
      if (action) {
        // Support prefix match with wildcard
        if (action.includes('*')) {
          conditions.push(sql`al.action LIKE ${action.replace('*', '%')}`);
        } else {
          conditions.push(sql`al.action = ${action}`);
        }
      }
      if (entityType) {
        conditions.push(sql`al.entity_type = ${entityType}`);
      }
      if (entityId) {
        conditions.push(sql`al.entity_id = ${entityId}`);
      }
      if (locationId) {
        conditions.push(sql`al.location_id = ${locationId}`);
      }
      if (dateFrom) {
        conditions.push(sql`al.created_at >= ${dateFrom}::timestamptz`);
      }
      if (dateTo) {
        conditions.push(sql`al.created_at <= ${dateTo}::timestamptz`);
      }

      const whereClause = sql`WHERE ${sql.join(conditions, sql` AND `)}`;

      const countResult = await tx.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM audit_log al
        ${whereClause}
      `);
      const total = Number(Array.from(countResult as Iterable<{ total: number }>)[0]?.total ?? 0);

      const rows = await tx.execute(sql`
        SELECT
          al.id,
          al.actor_user_id,
          u.display_name AS actor_name,
          al.actor_type,
          al.action,
          al.entity_type,
          al.entity_id,
          al.location_id,
          l.name AS location_name,
          al.changes,
          al.metadata,
          al.created_at,
          CASE WHEN al.actor_type = 'impersonation' THEN true ELSE false END AS is_impersonation,
          CASE
            WHEN al.actor_type = 'impersonation' THEN al.metadata->>'impersonator_admin_name'
            ELSE NULL
          END AS impersonator_admin_name
        FROM audit_log al
        LEFT JOIN users u ON u.id = al.actor_user_id AND u.tenant_id = ${tenantId}
        LEFT JOIN locations l ON l.id = al.location_id AND l.tenant_id = ${tenantId}
        ${whereClause}
        ORDER BY al.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        actorUserId: r.actor_user_id as string | null,
        actorName: r.actor_name as string | null,
        actorType: r.actor_type as string,
        action: r.action as string,
        entityType: r.entity_type as string,
        entityId: r.entity_id as string,
        locationId: r.location_id as string | null,
        locationName: r.location_name as string | null,
        changes: r.changes as Record<string, unknown> | null,
        metadata: r.metadata as Record<string, unknown> | null,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        isImpersonation: r.is_impersonation === true,
        impersonatorAdminName: r.impersonator_admin_name as string | null,
      }));

      return { items, total, page, limit };
    });

    return NextResponse.json({ data: result });
  },
  { permission: 'system.view' },
);
