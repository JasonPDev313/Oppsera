import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
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

  // User has no tenant yet — needs onboarding
  if (!ctx.tenantId) {
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
    db.query.tenants.findFirst({ where: eq(tenants.id, ctx.tenantId) }),
    db.query.locations.findMany({
      where: and(eq(locations.tenantId, ctx.tenantId), eq(locations.isActive, true)),
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
        status: ctx.user.membershipStatus,
      },
      impersonation: ctx.impersonation
        ? { sessionId: ctx.impersonation.sessionId, adminEmail: ctx.impersonation.adminEmail }
        : null,
    },
  });
}, { authenticated: true, requireTenant: false });
