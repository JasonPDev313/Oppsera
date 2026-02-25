import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db, sql } from '@oppsera/db';
import { tenants } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { logAdminAudit, getClientIp, sanitizeSnapshot } from '@/lib/admin-audit';

export const GET = withAdminPermission(async (req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const rows = await db.execute(sql`
    SELECT
      t.id, t.name, t.slug, t.status, t.billing_customer_id, t.created_at, t.updated_at,
      t.industry, t.onboarding_status, t.health_grade,
      t.primary_contact_email, t.primary_contact_name, t.primary_contact_phone,
      t.internal_notes, t.activated_at, t.suspended_at, t.suspended_reason,
      t.metadata, t.total_locations, t.total_users, t.last_activity_at,
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
  const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

  return NextResponse.json({
    data: {
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      status: r.status as string,
      industry: (r.industry as string | null) ?? null,
      onboardingStatus: (r.onboarding_status as string) ?? 'pending',
      healthGrade: (r.health_grade as string) ?? 'A',
      primaryContactEmail: (r.primary_contact_email as string | null) ?? null,
      primaryContactName: (r.primary_contact_name as string | null) ?? null,
      primaryContactPhone: (r.primary_contact_phone as string | null) ?? null,
      internalNotes: (r.internal_notes as string | null) ?? null,
      activatedAt: ts(r.activated_at),
      suspendedAt: ts(r.suspended_at),
      suspendedReason: (r.suspended_reason as string | null) ?? null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      totalLocations: Number(r.total_locations ?? 0),
      totalUsers: Number(r.total_users ?? 0),
      billingCustomerId: (r.billing_customer_id as string) ?? null,
      siteCount: Number(r.site_count),
      venueCount: Number(r.venue_count),
      profitCenterCount: Number(r.profit_center_count),
      terminalCount: Number(r.terminal_count),
      userCount: Number(r.user_count),
      entitlementCount: Number(r.entitlement_count),
      lastActivityAt: ts(r.last_activity_at),
      createdAt: ts(r.created_at) ?? '',
      updatedAt: ts(r.updated_at) ?? '',
    },
  });
}, { permission: 'tenants.read' });

export const PATCH = withAdminPermission(async (req: NextRequest, session, params) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  // Fetch before snapshot
  const [before] = await db.select().from(tenants).where(eq(tenants.id, id));
  if (!before) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updates.name = body.name;
  if (body.slug !== undefined) updates.slug = body.slug;
  if (body.status !== undefined) updates.status = body.status;
  if (body.billingCustomerId !== undefined) updates.billingCustomerId = body.billingCustomerId;
  if (body.industry !== undefined) updates.industry = body.industry;
  if (body.primaryContactEmail !== undefined) updates.primaryContactEmail = body.primaryContactEmail;
  if (body.primaryContactName !== undefined) updates.primaryContactName = body.primaryContactName;
  if (body.primaryContactPhone !== undefined) updates.primaryContactPhone = body.primaryContactPhone;
  if (body.internalNotes !== undefined) updates.internalNotes = body.internalNotes;
  if (body.metadata !== undefined) updates.metadata = body.metadata;

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

  // Audit log with before/after snapshots
  void logAdminAudit({
    session,
    action: 'tenant.updated',
    entityType: 'tenant',
    entityId: id,
    tenantId: id,
    beforeSnapshot: sanitizeSnapshot(before as unknown as Record<string, unknown>),
    afterSnapshot: sanitizeSnapshot(updated as unknown as Record<string, unknown>),
    ipAddress: getClientIp(req),
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      status: updated.status,
      industry: updated.industry ?? null,
    },
  });
}, { permission: 'tenants.write' });
