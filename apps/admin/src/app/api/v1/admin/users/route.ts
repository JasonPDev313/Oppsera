import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export const GET = withAdminPermission(async (req: NextRequest) => {
  const sp = new URL(req.url).searchParams;
  const search = sp.get('search');
  const tenantId = sp.get('tenantId');
  const status = sp.get('status');
  const isLocked = sp.get('isLocked');
  const hasMfa = sp.get('hasMfa');
  const sort = sp.get('sort') ?? 'name';
  const cursor = sp.get('cursor');
  const limit = Math.min(Number(sp.get('limit') ?? 50), 100);

  let whereClause = sql`WHERE 1=1`;
  if (search) {
    whereClause = sql`${whereClause} AND (u.email ILIKE ${'%' + search + '%'} OR u.name ILIKE ${'%' + search + '%'} OR u.first_name ILIKE ${'%' + search + '%'} OR u.last_name ILIKE ${'%' + search + '%'})`;
  }
  if (tenantId) whereClause = sql`${whereClause} AND u.tenant_id = ${tenantId}`;
  if (status) whereClause = sql`${whereClause} AND u.status = ${status}`;
  if (isLocked === 'true') whereClause = sql`${whereClause} AND us.locked_until IS NOT NULL AND us.locked_until > now()`;
  if (hasMfa === 'true') whereClause = sql`${whereClause} AND us.mfa_enabled = true`;
  if (cursor) whereClause = sql`${whereClause} AND u.id < ${cursor}`;

  const orderClause = sort === 'email' ? sql`ORDER BY u.email ASC, u.id DESC`
    : sort === 'last_login_at' ? sql`ORDER BY u.last_login_at DESC NULLS LAST, u.id DESC`
    : sort === 'created_at' ? sql`ORDER BY u.created_at DESC, u.id DESC`
    : sql`ORDER BY u.name ASC, u.id DESC`;

  const result = await db.execute(sql`
    SELECT
      u.id, u.email, u.name, u.first_name, u.last_name, u.display_name,
      u.phone, u.status, u.last_login_at, u.created_at, u.tenant_id,
      u.password_reset_required,
      t.name as tenant_name, t.slug as tenant_slug,
      us.mfa_enabled,
      us.failed_login_count,
      us.locked_until,
      CASE WHEN us.locked_until IS NOT NULL AND us.locked_until > now() THEN true ELSE false END as is_locked,
      (
        SELECT string_agg(r.name, ', ')
        FROM user_roles ur JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = u.id
      ) as role_names
    FROM users u
    LEFT JOIN tenants t ON u.tenant_id = t.id
    LEFT JOIN user_security us ON us.user_id = u.id
    ${whereClause}
    ${orderClause}
    LIMIT ${limit + 1}
  `);

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    data: {
      items: items.map(r => ({
        id: r.id as string,
        email: r.email as string,
        name: r.name as string | null,
        firstName: r.first_name as string | null,
        lastName: r.last_name as string | null,
        displayName: r.display_name as string | null,
        phone: r.phone as string | null,
        status: r.status as string,
        lastLoginAt: r.last_login_at as string | null,
        createdAt: r.created_at as string,
        tenantId: r.tenant_id as string,
        tenantName: r.tenant_name as string | null,
        tenantSlug: r.tenant_slug as string | null,
        passwordResetRequired: r.password_reset_required as boolean,
        mfaEnabled: r.mfa_enabled as boolean | null,
        failedLoginCount: r.failed_login_count as number | null,
        lockedUntil: r.locked_until as string | null,
        isLocked: r.is_locked as boolean,
        roleNames: r.role_names as string | null,
      })),
      cursor: hasMore ? (items[items.length - 1]?.id as string) : null,
      hasMore,
    },
  });
}, { permission: 'users.staff.view' });
