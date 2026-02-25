import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { db } from '@oppsera/db';
import { sql } from 'drizzle-orm';

export const GET = withAdminPermission(async (_req: NextRequest, _session, params) => {
  const userId = params?.id;
  if (!userId) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'User ID required' } }, { status: 400 });
  }

  const result = await db.execute(sql`
    SELECT
      u.id, u.email, u.name, u.first_name, u.last_name, u.display_name,
      u.phone, u.status, u.last_login_at, u.created_at, u.tenant_id,
      u.password_reset_required,
      t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status,
      us.mfa_enabled, us.failed_login_count, us.locked_until,
      CASE WHEN us.locked_until IS NOT NULL AND us.locked_until > now()
        THEN true ELSE false END as is_locked,
      (
        SELECT json_agg(json_build_object('role_id', r.id, 'role_name', r.name))
        FROM user_roles ur JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = u.id
      ) as roles,
      (
        SELECT json_agg(json_build_object(
          'role_id', r.id, 'role_name', r.name,
          'location_id', ra.location_id, 'location_name', l.name
        ))
        FROM role_assignments ra
        JOIN roles r ON ra.role_id = r.id
        LEFT JOIN locations l ON ra.location_id = l.id
        WHERE ra.user_id = u.id
      ) as role_assignments
    FROM users u
    LEFT JOIN tenants t ON u.tenant_id = t.id
    LEFT JOIN user_security us ON us.user_id = u.id
    WHERE u.id = ${userId}
  `);

  const rows = Array.from(result as Iterable<Record<string, unknown>>);
  if (rows.length === 0) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, { status: 404 });
  }

  const r = rows[0]!;
  return NextResponse.json({
    data: {
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
      tenantStatus: r.tenant_status as string | null,
      passwordResetRequired: r.password_reset_required as boolean,
      mfaEnabled: r.mfa_enabled as boolean | null,
      failedLoginCount: r.failed_login_count as number | null,
      lockedUntil: r.locked_until as string | null,
      isLocked: r.is_locked as boolean,
      roles: r.roles as Array<{ role_id: string; role_name: string }> | null,
      roleAssignments: r.role_assignments as Array<{ role_id: string; role_name: string; location_id: string | null; location_name: string | null }> | null,
    },
  });
}, { permission: 'users.staff.view' });
