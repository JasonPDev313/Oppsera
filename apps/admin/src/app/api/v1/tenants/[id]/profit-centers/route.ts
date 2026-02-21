import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { buildAdminCtx } from '@/lib/admin-context';
import { db, sql } from '@oppsera/db';
import { createProfitCenter } from '@oppsera/core';

export const GET = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const locationId = sp.get('locationId') ?? '';
  const includeInactive = sp.get('includeInactive') === 'true';

  const conditions = [sql`tl.tenant_id = ${tenantId}`];

  if (locationId) {
    conditions.push(sql`tl.location_id = ${locationId}`);
  }
  if (!includeInactive) {
    conditions.push(sql`tl.is_active = true`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const rows = await db.execute(sql`
    SELECT
      tl.id, tl.tenant_id, tl.location_id, tl.title, tl.code,
      tl.description, tl.icon, tl.is_active, tl.tips_applicable,
      tl.sort_order, tl.created_at,
      l.name AS location_name,
      (SELECT COUNT(*)::int FROM terminals WHERE terminal_location_id = tl.id AND is_active = true) AS terminal_count
    FROM terminal_locations tl
    LEFT JOIN locations l ON l.id = tl.location_id
    WHERE ${whereClause}
    ORDER BY tl.sort_order ASC, tl.title ASC
  `);

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    locationId: r.location_id as string,
    locationName: (r.location_name as string) ?? null,
    name: r.title as string,
    code: (r.code as string) ?? null,
    description: (r.description as string) ?? null,
    icon: (r.icon as string) ?? null,
    isActive: r.is_active as boolean,
    tipsApplicable: r.tips_applicable as boolean,
    sortOrder: Number(r.sort_order),
    terminalCount: Number(r.terminal_count),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  return NextResponse.json({ data: items });
});

export const POST = withAdminAuth(async (req: NextRequest, session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json();
  const ctx = buildAdminCtx(session, tenantId);

  try {
    const result = await createProfitCenter(ctx, {
      locationId: body.locationId,
      name: body.name,
      code: body.code,
      description: body.description,
      icon: body.icon,
      tipsApplicable: body.tipsApplicable,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
      allowSiteLevel: body.allowSiteLevel,
    });

    return NextResponse.json(
      { data: { id: result.id, name: result.title, locationId: result.locationId } },
      { status: 201 },
    );
  } catch (err: unknown) {
    const error = err as { statusCode?: number; code?: string; message?: string };
    const status = error.statusCode ?? 500;
    return NextResponse.json(
      { error: { code: error.code ?? 'INTERNAL_ERROR', message: error.message ?? 'Failed to create profit center' } },
      { status },
    );
  }
}, 'admin');
