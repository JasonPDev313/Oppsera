import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { sql } from '@oppsera/db';
import { generateSlug, generateUlid } from '@oppsera/shared';
import { roles, rolePermissions } from '@oppsera/db';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';
import { withAdminDb } from '@/lib/admin-db';

const SYSTEM_ROLES = [
  { name: 'Super Admin', description: 'All permissions across all modules — auto-includes new permissions', permissions: ['*'] },
  { name: 'Owner', description: 'Full access to all features', permissions: ['*'] },
  { name: 'Manager', description: 'Full operational control across all modules', permissions: ['catalog.*', 'orders.*', 'inventory.*', 'customers.*', 'tenders.*', 'reports.view', 'settings.view', 'price.override', 'charges.manage', 'cash.drawer', 'shift.manage', 'discounts.apply', 'returns.create'] },
  { name: 'Supervisor', description: 'Manage orders and POS operations, view catalog and inventory', permissions: ['catalog.view', 'orders.*', 'inventory.view', 'customers.view', 'tenders.create', 'tenders.view', 'reports.view', 'price.override', 'charges.manage', 'cash.drawer', 'shift.manage', 'discounts.apply', 'returns.create'] },
  { name: 'Cashier', description: 'Ring up sales, process payments, manage cash drawer', permissions: ['catalog.view', 'orders.create', 'orders.view', 'tenders.create', 'tenders.view', 'customers.view', 'customers.create', 'discounts.apply', 'cash.drawer', 'shift.manage'] },
  { name: 'Server', description: 'F&B order entry, process payments, manage tables', permissions: ['catalog.view', 'orders.create', 'orders.view', 'tenders.create', 'tenders.view', 'customers.view', 'discounts.apply', 'cash.drawer', 'shift.manage'] },
  { name: 'Staff', description: 'View catalog and orders', permissions: ['catalog.view', 'orders.view'] },
] as const;

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const search = sp.get('search') ?? '';
  const status = sp.get('status') ?? '';
  const industry = sp.get('industry') ?? '';
  const onboardingStatus = sp.get('onboarding_status') ?? '';
  const healthGrade = sp.get('health_grade') ?? '';
  const sort = sp.get('sort') ?? 'created_at';
  const cursor = sp.get('cursor') ?? '';
  const limit = Math.min(Number(sp.get('limit') ?? 50), 100);

  // Full conditions (requires Phase 1A columns from migration 0195)
  const conditions = [sql`1=1`];
  if (search) {
    const term = `%${search}%`;
    conditions.push(sql`(t.name ILIKE ${term} OR t.slug ILIKE ${term} OR t.primary_contact_email ILIKE ${term})`);
  }
  if (status) conditions.push(sql`t.status = ${status}`);
  if (industry) conditions.push(sql`t.industry = ${industry}`);
  if (onboardingStatus) conditions.push(sql`t.onboarding_status = ${onboardingStatus}`);
  if (healthGrade) conditions.push(sql`t.health_grade = ${healthGrade}`);
  if (cursor) conditions.push(sql`t.created_at < (SELECT created_at FROM tenants WHERE id = ${cursor})`);
  const whereClause = sql.join(conditions, sql` AND `);

  // Fallback conditions use only base columns (no Phase 1A columns)
  const fallbackConditions = [sql`1=1`];
  if (search) {
    const term = `%${search}%`;
    fallbackConditions.push(sql`(t.name ILIKE ${term} OR t.slug ILIKE ${term})`);
  }
  if (status) fallbackConditions.push(sql`t.status = ${status}`);
  if (cursor) fallbackConditions.push(sql`t.created_at < (SELECT created_at FROM tenants WHERE id = ${cursor})`);
  const fallbackWhereClause = sql.join(fallbackConditions, sql` AND `);

  // Sort column mapping
  const sortMap: Record<string, ReturnType<typeof sql>> = {
    name: sql`t.name ASC`,
    created_at: sql`t.created_at DESC`,
    last_activity_at: sql`t.last_activity_at DESC NULLS LAST`,
    health_grade: sql`t.health_grade ASC`,
  };
  const orderBy = sortMap[sort] ?? sortMap.created_at!;

  // Use two separate withAdminDb calls so the fallback runs in a fresh transaction
  // (PostgreSQL aborts the entire transaction when a query fails — fallback inside the same tx won't work)
  let items: Record<string, unknown>[];
  let usedFallback = false;

  try {
    const rows = await withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT
          t.id, t.name, t.slug, t.status, t.billing_customer_id, t.created_at, t.updated_at,
          t.industry, t.onboarding_status, t.health_grade,
          t.primary_contact_email, t.primary_contact_name, t.last_activity_at,
          (SELECT COUNT(*)::int FROM locations WHERE tenant_id = t.id AND location_type = 'site' AND is_active = true) AS site_count,
          (SELECT COUNT(*)::int FROM locations WHERE tenant_id = t.id AND location_type = 'venue' AND is_active = true) AS venue_count,
          (SELECT COUNT(*)::int FROM terminal_locations WHERE tenant_id = t.id AND is_active = true) AS profit_center_count,
          (SELECT COUNT(*)::int FROM terminals WHERE tenant_id = t.id AND is_active = true) AS terminal_count,
          (SELECT COUNT(*)::int FROM users WHERE tenant_id = t.id AND status = 'active') AS user_count
        FROM tenants t
        WHERE ${whereClause}
        ORDER BY ${orderBy}
        LIMIT ${limit + 1}
      `);
    });
    items = Array.from(rows as Iterable<Record<string, unknown>>);
  } catch (err) {
    console.error('[tenants/GET] Full query failed, using fallback:', (err as Error).message);
    usedFallback = true;
    const rows = await withAdminDb(async (tx) => {
      return tx.execute(sql`
        SELECT t.id, t.name, t.slug, t.status, t.billing_customer_id, t.created_at, t.updated_at
        FROM tenants t
        WHERE ${fallbackWhereClause}
        ORDER BY t.created_at DESC
        LIMIT ${limit + 1}
      `);
    });
    items = Array.from(rows as Iterable<Record<string, unknown>>);
  }

  const hasMore = items.length > limit;
  if (hasMore) items.pop();

  const ts = (v: unknown) => v instanceof Date ? v.toISOString() : v ? String(v) : null;

  const data = items.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    status: r.status as string,
    industry: usedFallback ? null : (r.industry as string | null) ?? null,
    onboardingStatus: usedFallback ? 'pending' : (r.onboarding_status as string) ?? 'pending',
    healthGrade: usedFallback ? 'A' : (r.health_grade as string) ?? 'A',
    primaryContactEmail: usedFallback ? null : (r.primary_contact_email as string | null) ?? null,
    primaryContactName: usedFallback ? null : (r.primary_contact_name as string | null) ?? null,
    siteCount: usedFallback ? 0 : Number(r.site_count),
    venueCount: usedFallback ? 0 : Number(r.venue_count),
    profitCenterCount: usedFallback ? 0 : Number(r.profit_center_count),
    terminalCount: usedFallback ? 0 : Number(r.terminal_count),
    userCount: usedFallback ? 0 : Number(r.user_count),
    lastActivityAt: usedFallback ? null : ts(r.last_activity_at),
    createdAt: ts(r.created_at) ?? '',
  }));

  return NextResponse.json({
    data: {
      items: data,
      cursor: hasMore && data.length > 0 ? data[data.length - 1]!.id : null,
      hasMore,
    },
  });
}, { permission: 'tenants.read' });

export const POST = withAdminPermission(async (req: NextRequest, session) => {
  const body = await req.json();
  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: { message: 'Name is required' } }, { status: 400 });
  }

  const slug = (body.slug ?? '').trim() || generateSlug(name);
  const status = body.status ?? 'active';
  const timezone = body.timezone ?? 'America/New_York';
  const siteName = (body.siteName ?? '').trim() || name;
  const industry = (body.industry ?? '').trim() || null;
  const primaryContactEmail = (body.primaryContactEmail ?? '').trim() || null;
  const primaryContactName = (body.primaryContactName ?? '').trim() || null;
  const primaryContactPhone = (body.primaryContactPhone ?? '').trim() || null;

  // Check slug uniqueness
  const existing = await withAdminDb(async (tx) => tx.execute(
    sql`SELECT id FROM tenants WHERE slug = ${slug} LIMIT 1`,
  ));
  if (Array.from(existing as Iterable<unknown>).length > 0) {
    return NextResponse.json({ error: { message: `Slug "${slug}" already exists` } }, { status: 409 });
  }

  const tenantId = generateUlid();
  const locationId = generateUlid();

  await withAdminDb(async (tx) => {
    // Insert tenant with base columns only (Phase 1A columns may not exist yet)
    await tx.execute(sql`
      INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
      VALUES (${tenantId}, ${name}, ${slug}, ${status}, NOW(), NOW())
    `);

    // Try to set Phase 1A columns (best-effort — migration 0195 may not be run)
    try {
      await tx.execute(sql`
        UPDATE tenants SET
          industry = ${industry},
          primary_contact_email = ${primaryContactEmail},
          primary_contact_name = ${primaryContactName},
          primary_contact_phone = ${primaryContactPhone},
          activated_at = ${status === 'active' ? new Date() : null}
        WHERE id = ${tenantId}
      `);
    } catch {
      // Phase 1A columns don't exist yet — skip
    }

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

    // Auto-initialize onboarding from templates if industry provided (best-effort)
    if (industry) {
      try {
        const templateRows = await tx.execute(sql`
          SELECT step_key, step_label, step_group, sort_order
          FROM onboarding_step_templates
          WHERE industry = ${industry}
          ORDER BY sort_order
        `);
        const templates = Array.from(templateRows as Iterable<Record<string, unknown>>);

        for (const tmpl of templates) {
          await tx.execute(sql`
            INSERT INTO tenant_onboarding_checklists (tenant_id, step_key, step_label, step_group, sort_order, status)
            VALUES (${tenantId}, ${tmpl.step_key as string}, ${tmpl.step_label as string}, ${tmpl.step_group as string}, ${tmpl.sort_order as number}, 'pending')
          `);
        }

        if (templates.length > 0) {
          await tx.execute(sql`
            UPDATE tenants SET onboarding_status = 'in_progress' WHERE id = ${tenantId}
          `);
        }
      } catch {
        // Onboarding tables don't exist yet — skip
      }
    }
  });

  // Audit log
  void logAdminAudit({
    session,
    action: 'tenant.created',
    entityType: 'tenant',
    entityId: tenantId,
    afterSnapshot: { name, slug, status, industry, primaryContactEmail, primaryContactName },
    ipAddress: getClientIp(req),
  });

  return NextResponse.json(
    { data: { id: tenantId, name, slug, status, industry } },
    { status: 201 },
  );
}, { permission: 'tenants.create' });
