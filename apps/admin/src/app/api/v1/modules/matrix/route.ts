import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

// GET - Capability matrix: all tenants x modules
export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const industry = sp.get('industry');
  const status = sp.get('status');
  const search = sp.get('search');

  const conditions: ReturnType<typeof sql>[] = [sql`t.status != 'deleted'`];
  if (industry) conditions.push(sql`t.industry = ${industry}`);
  if (status) conditions.push(sql`t.status = ${status}`);
  if (search) conditions.push(sql`(t.name ILIKE ${'%' + search + '%'} OR t.slug ILIKE ${'%' + search + '%'})`);

  const whereClause = sql.join(conditions, sql` AND `);

  const result = await db.execute(sql`
    SELECT
      t.id as tenant_id,
      t.name as tenant_name,
      t.slug as tenant_slug,
      t.industry,
      t.status,
      COALESCE(
        json_object_agg(e.module_key, COALESCE(e.access_mode, 'off')) FILTER (WHERE e.module_key IS NOT NULL),
        '{}'::json
      ) as modules
    FROM tenants t
    LEFT JOIN entitlements e ON e.tenant_id = t.id
    WHERE ${whereClause}
    GROUP BY t.id, t.name, t.slug, t.industry, t.status
    ORDER BY t.name
    LIMIT 200
  `);

  const rows = Array.from(result as Iterable<Record<string, unknown>>).map(r => ({
    tenantId: r.tenant_id as string,
    tenantName: r.tenant_name as string,
    tenantSlug: r.tenant_slug as string,
    industry: r.industry as string | null,
    status: r.status as string,
    modules: (typeof r.modules === 'string' ? JSON.parse(r.modules) : r.modules) as Record<string, string>,
  }));

  return NextResponse.json({ data: rows });
}, { permission: 'tenants.view' });
