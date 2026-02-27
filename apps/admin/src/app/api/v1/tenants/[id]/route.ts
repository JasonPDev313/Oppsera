import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { sql } from '@oppsera/db';
import { tenants } from '@oppsera/db';
import { eq } from 'drizzle-orm';
import { logAdminAudit, getClientIp, sanitizeSnapshot } from '@/lib/admin-audit';
import { withAdminDb } from '@/lib/admin-db';

export const GET = withAdminPermission(async (req: NextRequest, _session, params) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

  const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

  // Use two separate withAdminDb calls so the fallback runs in a fresh transaction
  // (PostgreSQL aborts the entire transaction when a query fails — fallback inside the same tx won't work)
  let result: Record<string, unknown>[];
  try {
    const rows = await withAdminDb(async (tx) => {
      return tx.execute(sql`
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
    });
    result = Array.from(rows as Iterable<Record<string, unknown>>);
  } catch (err) {
    console.error('[tenants/[id]/GET] Full query failed, using fallback:', (err as Error).message);
    const rows = await withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT t.id, t.name, t.slug, t.status, t.billing_customer_id, t.created_at, t.updated_at
        FROM tenants t
        WHERE t.id = ${id}
        LIMIT 1
      `);
    });
    result = Array.from(rows as Iterable<Record<string, unknown>>);
  }

  if (result.length === 0) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }
  const r = result[0]!;

  return NextResponse.json({
    data: {
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      status: r.status as string,
      industry: (r.industry as string | null) ?? null,
      onboardingStatus: (r.onboarding_status as string | null) ?? 'pending',
      healthGrade: (r.health_grade as string | null) ?? 'A',
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
      siteCount: Number(r.site_count ?? 0),
      venueCount: Number(r.venue_count ?? 0),
      profitCenterCount: Number(r.profit_center_count ?? 0),
      terminalCount: Number(r.terminal_count ?? 0),
      userCount: Number(r.user_count ?? 0),
      entitlementCount: Number(r.entitlement_count ?? 0),
      lastActivityAt: ts(r.last_activity_at),
      createdAt: ts(r.created_at) ?? '',
      updatedAt: ts(r.updated_at) ?? '',
    },
  });
}, { permission: 'tenants.read' });

export const PATCH = withAdminPermission(async (req: NextRequest, session, params) => {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: { message: 'Missing tenant ID' } }, { status: 400 });

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

  const { before, updated } = await withAdminDb(async (tx) => {
    // Fetch before snapshot using only base columns
    const [b] = await tx
      .select({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status, createdAt: tenants.createdAt })
      .from(tenants)
      .where(eq(tenants.id, id));
    if (!b) return { before: null, updated: null };

    // If slug is being changed, check uniqueness
    if (updates.slug) {
      const existing = await tx.execute(
        sql`SELECT id FROM tenants WHERE slug = ${updates.slug as string} AND id != ${id} LIMIT 1`,
      );
      if (Array.from(existing as Iterable<unknown>).length > 0) {
        return { before: b, updated: 'slug_conflict' as const };
      }
    }

    // Separate base updates from Phase 1A updates
    const baseUpdates: Record<string, unknown> = { updatedAt: new Date() };
    const phase1aUpdates: Record<string, unknown> = {};

    const PHASE1A_KEYS = new Set(['industry', 'primaryContactEmail', 'primaryContactName', 'primaryContactPhone', 'internalNotes', 'metadata']);
    for (const [key, val] of Object.entries(updates)) {
      if (key === 'updatedAt') continue;
      if (PHASE1A_KEYS.has(key)) {
        phase1aUpdates[key] = val;
      } else {
        baseUpdates[key] = val;
      }
    }

    // Always apply base updates
    const [u] = await tx
      .update(tenants)
      .set(baseUpdates)
      .where(eq(tenants.id, id))
      .returning({ id: tenants.id, name: tenants.name, slug: tenants.slug, status: tenants.status });

    // Try Phase 1A updates (best-effort)
    if (Object.keys(phase1aUpdates).length > 0) {
      try {
        await tx.update(tenants).set(phase1aUpdates).where(eq(tenants.id, id));
      } catch {
        // Phase 1A columns don't exist yet — skip
      }
    }

    return { before: b, updated: u };
  });

  if (!before) {
    return NextResponse.json({ error: { message: 'Tenant not found' } }, { status: 404 });
  }
  if (updated === 'slug_conflict') {
    return NextResponse.json({ error: { message: `Slug "${updates.slug}" already exists` } }, { status: 409 });
  }

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
    },
  });
}, { permission: 'tenants.write' });
