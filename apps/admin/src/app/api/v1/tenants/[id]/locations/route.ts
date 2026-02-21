import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { locations } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';

export const GET = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const locationType = sp.get('type') ?? '';
  const parentId = sp.get('parentId') ?? '';
  const includeInactive = sp.get('includeInactive') === 'true';

  const conditions = [sql`l.tenant_id = ${tenantId}`];

  if (locationType) {
    conditions.push(sql`l.location_type = ${locationType}`);
  }
  if (parentId) {
    conditions.push(sql`l.parent_location_id = ${parentId}`);
  } else if (locationType === 'site') {
    conditions.push(sql`l.parent_location_id IS NULL`);
  }
  if (!includeInactive) {
    conditions.push(sql`l.is_active = true`);
  }

  const whereClause = sql.join(conditions, sql` AND `);

  const rows = await db.execute(sql`
    SELECT
      l.id, l.tenant_id, l.name, l.location_type, l.parent_location_id,
      l.timezone, l.address_line1, l.city, l.state, l.postal_code, l.country,
      l.phone, l.email, l.is_active, l.created_at,
      (SELECT COUNT(*)::int FROM locations WHERE parent_location_id = l.id AND is_active = true) AS child_venue_count,
      (SELECT COUNT(*)::int FROM terminal_locations WHERE location_id = l.id AND is_active = true) AS profit_center_count
    FROM locations l
    WHERE ${whereClause}
    ORDER BY l.name ASC
  `);

  const items = Array.from(rows as Iterable<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    tenantId: r.tenant_id as string,
    name: r.name as string,
    locationType: r.location_type as string,
    parentLocationId: (r.parent_location_id as string) ?? null,
    timezone: r.timezone as string,
    addressLine1: (r.address_line1 as string) ?? null,
    city: (r.city as string) ?? null,
    state: (r.state as string) ?? null,
    postalCode: (r.postal_code as string) ?? null,
    country: (r.country as string) ?? 'US',
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    isActive: r.is_active as boolean,
    childVenueCount: Number(r.child_venue_count),
    profitCenterCount: Number(r.profit_center_count),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  return NextResponse.json({ data: items });
});

export const POST = withAdminAuth(async (req: NextRequest, _session, params) => {
  const tenantId = params?.id;
  if (!tenantId) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json();
  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: { message: 'Name is required' } }, { status: 400 });
  }

  const locationType = body.locationType ?? 'site';
  if (locationType !== 'site' && locationType !== 'venue') {
    return NextResponse.json({ error: { message: 'locationType must be "site" or "venue"' } }, { status: 400 });
  }

  // Venue requires parentLocationId
  if (locationType === 'venue') {
    if (!body.parentLocationId) {
      return NextResponse.json({ error: { message: 'parentLocationId is required for venues' } }, { status: 400 });
    }
    // Validate parent exists and belongs to tenant
    const parent = await db.execute(
      sql`SELECT id FROM locations WHERE id = ${body.parentLocationId} AND tenant_id = ${tenantId} AND is_active = true LIMIT 1`,
    );
    if (Array.from(parent as Iterable<unknown>).length === 0) {
      return NextResponse.json({ error: { message: 'Parent location not found' } }, { status: 404 });
    }
  }

  const locationId = generateUlid();

  await db.insert(locations).values({
    id: locationId,
    tenantId,
    name,
    locationType,
    parentLocationId: body.parentLocationId ?? null,
    timezone: body.timezone ?? 'America/New_York',
    addressLine1: body.addressLine1 ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    postalCode: body.postalCode ?? null,
    country: body.country ?? 'US',
    phone: body.phone ?? null,
    email: body.email ?? null,
    isActive: true,
  });

  return NextResponse.json(
    { data: { id: locationId, name, locationType, tenantId } },
    { status: 201 },
  );
}, 'admin');
