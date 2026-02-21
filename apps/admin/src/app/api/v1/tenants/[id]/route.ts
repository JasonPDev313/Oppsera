import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { db, sql } from '@oppsera/db';
import { tenants } from '@oppsera/db';
import { eq } from 'drizzle-orm';

export const GET = withAdminAuth(async (req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const rows = await db.execute(sql`
    SELECT
      t.id, t.name, t.slug, t.status, t.billing_customer_id, t.created_at, t.updated_at,
      (SELECT COUNT(*)::int FROM locations WHERE tenant_id = t.id AND location_type = 'site' AND is_active = true) AS site_count,
      (SELECT COUNT(*)::int FROM locations WHERE tenant_id = t.id AND location_type = 'venue' AND is_active = true) AS venue_count,
      (SELECT COUNT(*)::int FROM terminal_locations WHERE tenant_id = t.id AND is_active = true) AS profit_center_count,
      (SELECT COUNT(*)::int FROM terminals WHERE tenant_id = t.id AND is_active = true) AS terminal_count,
      (SELECT COUNT(*)::int FROM users WHERE tenant_id = t.id AND status = 'active') AS user_count,
      (SELECT COUNT(*)::int FROM entitlements WHERE tenant_id = t.id AND is_enabled = true) AS entitlement_count
    FROM tenants t
    WHERE t.id = ${id}
    LIMIT 1
  `);

  const items = Array.from(rows as Iterable<Record<string, unknown>>);
  if (items.length === 0) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }

  const r = items[0]!;
  return NextResponse.json({
    data: {
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      status: r.status as string,
      billingCustomerId: (r.billing_customer_id as string) ?? null,
      siteCount: Number(r.site_count),
      venueCount: Number(r.venue_count),
      profitCenterCount: Number(r.profit_center_count),
      terminalCount: Number(r.terminal_count),
      userCount: Number(r.user_count),
      entitlementCount: Number(r.entitlement_count),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    },
  });
});

export const PATCH = withAdminAuth(async (req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updates.name = body.name;
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.status !== undefined) updates.status = body.status;
  if (body.billingCustomerId !== undefined) updates.billingCustomerId = body.billingCustomerId;

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: { message: 'No fields to update' } }, { status: 400 });
  }

  // If slug is being changed, check uniqueness
  if (updates.slug) {
    const existing = await db.execute(
      sql`SELECT id FROM tenants WHERE slug = ${updates.slug as string} AND id != ${id} LIMIT 1`,
    );
    if (Array.from(existing as Iterable<unknown>).length > 0) {
      return NextResponse.json({ error: { message: `Slug "${updates.slug}" already exists` } }, { status: 409 });
    }
  }

  const [updated] = await db
    .update(tenants)
    .set(updates)
    .where(eq(tenants.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      status: updated.status,
    },
  });
}, 'admin');
