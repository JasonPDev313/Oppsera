import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { withAdminDb } from '@/lib/admin-db';
import { sql } from 'drizzle-orm';

// ── GET /api/v1/search/quick-nav — Quick navigation targets ──

export const GET = withAdminPermission(
  async (_req, session) => {
    const data = await withAdminDb(async (tx) => {
      // Recent tenants (from recent searches where entity_type = 'tenant')
      const tenantRows = await tx.execute(sql`
        SELECT DISTINCT ON (entity_id)
          entity_id AS id, entity_label AS name
        FROM admin_recent_searches
        WHERE admin_id = ${session.adminId}
          AND entity_type = 'tenant'
          AND entity_id IS NOT NULL
        ORDER BY entity_id, searched_at DESC
        LIMIT 5
      `);
      const recentTenants = Array.from(tenantRows as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        name: r.name as string,
      }));

      // Recent users
      const userRows = await tx.execute(sql`
        SELECT DISTINCT ON (entity_id)
          entity_id AS id, entity_label AS name
        FROM admin_recent_searches
        WHERE admin_id = ${session.adminId}
          AND entity_type = 'user'
          AND entity_id IS NOT NULL
        ORDER BY entity_id, searched_at DESC
        LIMIT 5
      `);
      const recentUsers = Array.from(userRows as Iterable<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        name: r.name as string,
      }));

      return { recentTenants, recentUsers };
    });

    return NextResponse.json({ data });
  },
  { permission: 'tenants.read' },
);
