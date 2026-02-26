import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db } from '@oppsera/db';
import { users, tenants, locations } from '@oppsera/db';

export const GET = withMiddleware(async (_request, ctx) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, ctx.user.id),
  });

  // For impersonation sessions, user will be null (admin:{id} doesn't exist in users table).
  // Use ctx.user fields directly as fallback.
  const userData = user
    ? { id: user.id, email: user.email, name: user.name, isPlatformAdmin: user.isPlatformAdmin }
    : { id: ctx.user.id, email: ctx.user.email, name: ctx.user.name, isPlatformAdmin: true };

  // Resolve tenant ID — ctx.tenantId may be stale from the auth adapter's
  // 120s TTL cache.  After onboarding creates a membership, the cached
  // AuthUser still has tenantId='' for up to 2 minutes.  When ctx.tenantId
  // is empty, double-check the memberships table so the freshly-onboarded
  // user gets their tenant data immediately.
  //
  // NOTE: This route runs with { requireTenant: false }, so no tenant config
  // is set on the connection — RLS on the memberships table would block the
  // Drizzle query API.  Use raw parameterized SQL which bypasses RLS via the
  // admin/service role connection.
  let resolvedTenantId = ctx.tenantId;
  let membershipStatus = ctx.user.membershipStatus ?? 'none';

  if (!resolvedTenantId) {
    const freshRows = await db.execute<{ tenant_id: string; status: string }>(
      sql`SELECT tenant_id, status FROM memberships WHERE user_id = ${ctx.user.id} AND status = 'active' LIMIT 1`
    );
    const freshMembership = Array.from(freshRows as Iterable<{ tenant_id: string; status: string }>)[0];
    if (freshMembership) {
      resolvedTenantId = freshMembership.tenant_id;
      membershipStatus = freshMembership.status;
    }
  }

  if (!resolvedTenantId) {
    return NextResponse.json({
      data: {
        user: userData,
        tenant: null,
        locations: [],
        membership: { status: 'none' },
        impersonation: null,
      },
    });
  }

  const [tenant, tenantLocations] = await Promise.all([
    db.query.tenants.findFirst({
      where: eq(tenants.id, resolvedTenantId),
      columns: { id: true, name: true, slug: true, status: true },
    }),
    db.query.locations.findMany({
      where: and(eq(locations.tenantId, resolvedTenantId), eq(locations.isActive, true)),
    }),
  ]);

  return NextResponse.json({
    data: {
      user: userData,
      tenant: {
        id: tenant?.id,
        name: tenant?.name,
        slug: tenant?.slug,
        status: tenant?.status,
      },
      locations: tenantLocations.map((l) => ({
        id: l.id,
        name: l.name,
        timezone: l.timezone,
        isActive: l.isActive,
      })),
      membership: {
        status: membershipStatus,
      },
      impersonation: ctx.impersonation
        ? { sessionId: ctx.impersonation.sessionId, adminEmail: ctx.impersonation.adminEmail }
        : null,
    },
  });
}, { authenticated: true, requireTenant: false });
