import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { generateSlug, generateUlid } from '@oppsera/shared';
import { tenants, roles, rolePermissions } from '@oppsera/db';

const SYSTEM_ROLES = [
  { name: 'Super Admin', description: 'All permissions across all modules — auto-includes new permissions', permissions: ['*'] },
  { name: 'Owner', description: 'Full access to all features', permissions: ['*'] },
  { name: 'Manager', description: 'Full operational control across all modules', permissions: ['catalog.*', 'orders.*', 'inventory.*', 'customers.*', 'tenders.*', 'reports.view', 'settings.view', 'price.override', 'charges.manage', 'cash.drawer', 'shift.manage', 'discounts.apply', 'returns.create'] },
  { name: 'Supervisor', description: 'Manage orders and POS operations, view catalog and inventory', permissions: ['catalog.view', 'orders.*', 'inventory.view', 'customers.view', 'tenders.create', 'tenders.view', 'reports.view', 'price.override', 'charges.manage', 'cash.drawer', 'shift.manage', 'discounts.apply', 'returns.create'] },
  { name: 'Cashier', description: 'Ring up sales, process payments, manage cash drawer', permissions: ['catalog.view', 'orders.create', 'orders.view', 'tenders.create', 'tenders.view', 'customers.view', 'customers.create', 'discounts.apply', 'cash.drawer', 'shift.manage'] },
  { name: 'Server', description: 'F&B order entry, process payments, manage tables', permissions: ['catalog.view', 'orders.create', 'orders.view', 'tenders.create', 'tenders.view', 'customers.view', 'discounts.apply', 'cash.drawer', 'shift.manage'] },
  { name: 'Staff', description: 'View catalog and orders', permissions: ['catalog.view', 'orders.view'] },
] as const;

export const GET = withAdminAuth(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const search = sp.get('search') ?? '';
  const status = sp.get('status') ?? '';
  const cursor = sp.get('cursor') ?? '';
  const limit = Math.min(Number(sp.get('limit') ?? 50), 100);

  const conditions = [sql`1=1`];

  if (search) {
    const term = `%${search}%`;
    conditions.push(sql`(t.name ILIKE ${term} OR t.slug ILIKE ${term})`);
  }
  if (status) {
    conditions.push(sql`t.status = ${status}`);
  }
  if (cursor) {
    conditions.push(sql`t.created_at < (SELECT created_at FROM tenants WHERE id = ${cursor})`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  // Try the full query with enrichment subqueries; fall back to basic if columns/tables are missing
  let items: Record<string, unknown>[];
  let usedFallback = false;

  try {
    const rows = await db.execute(sql`
      SELECT
        t.id, t.name, t.slug, t.status, t.billing_customer_id, t.created_at, t.updated_at,
        (SELECT COUNT(*)::int FROM locations WHERE tenant_id = t.id AND location_type = 'site' AND is_active = true) AS site_count,
        (SELECT COUNT(*)::int FROM locations WHERE tenant_id = t.id AND location_type = 'venue' AND is_active = true) AS venue_count,
        (SELECT COUNT(*)::int FROM terminal_locations WHERE tenant_id = t.id AND is_active = true) AS profit_center_count,
        (SELECT COUNT(*)::int FROM terminals WHERE tenant_id = t.id AND is_active = true) AS terminal_count,
        (SELECT COUNT(*)::int FROM users WHERE tenant_id = t.id AND status = 'active') AS user_count
      FROM tenants t
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ${limit + 1}
    `);
    items = Array.from(rows as Iterable<Record<string, unknown>>);
  } catch (err) {
    console.error('[tenants/GET] Full query failed, using fallback:', (err as Error).message);
    usedFallback = true;

    // Fallback: just list tenants without enrichment counts
    const rows = await db.execute(sql`
      SELECT t.id, t.name, t.slug, t.status, t.billing_customer_id, t.created_at, t.updated_at
      FROM tenants t
      WHERE ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ${limit + 1}
    `);
    items = Array.from(rows as Iterable<Record<string, unknown>>);
  }

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  const data = items.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    status: r.status as string,
    siteCount: usedFallback ? 0 : Number(r.site_count),
    venueCount: usedFallback ? 0 : Number(r.venue_count),
    profitCenterCount: usedFallback ? 0 : Number(r.profit_center_count),
    terminalCount: usedFallback ? 0 : Number(r.terminal_count),
    userCount: usedFallback ? 0 : Number(r.user_count),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  return NextResponse.json({
    data: {
      items: data,
      cursor: hasMore && data.length > 0 ? data[data.length - 1]!.id : null,
      hasMore,
    },
  });
});

export const POST = withAdminAuth(async (req: NextRequest) => {
  const body = await req.json();
  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: { message: 'Name is required' } }, { status: 400 });
  }

  const slug = (body.slug ?? '').trim() || generateSlug(name);
  const status = body.status ?? 'active';
  const timezone = body.timezone ?? 'America/New_York';
  const siteName = (body.siteName ?? '').trim() || name;

  // Check slug uniqueness
  const existing = await db.execute(
    sql`SELECT id FROM tenants WHERE slug = ${slug} LIMIT 1`,
  );
  if (Array.from(existing as Iterable<unknown>).length > 0) {
    return NextResponse.json({ error: { message: `Slug "${slug}" already exists` } }, { status: 409 });
  }

  const tenantId = generateUlid();
  const locationId = generateUlid();

  await db.transaction(async (tx) => {
    // Insert tenant
    await tx.insert(tenants).values({
      id: tenantId,
      name,
      slug,
      status,
    });

    // Insert first site location
    await tx.execute(sql`
      INSERT INTO locations (id, tenant_id, name, timezone, location_type, is_active)
      VALUES (${locationId}, ${tenantId}, ${siteName}, ${timezone}, 'site', true)
    `);

    // Seed system roles with permissions
    for (const roleDef of SYSTEM_ROLES) {
      const roleId = generateUlid();
      await tx.insert(roles).values({
        id: roleId,
        tenantId,
        name: roleDef.name,
        description: roleDef.description,
        isSystem: true,
      });
      for (const permission of roleDef.permissions) {
        await tx.insert(rolePermissions).values({
          id: generateUlid(),
          roleId,
          permission,
        });
      }
    }
  });

  return NextResponse.json(
    { data: { id: tenantId, name, slug, status } },
    { status: 201 },
  );
}, 'admin');
