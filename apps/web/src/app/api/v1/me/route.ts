import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db } from '@oppsera/db';
import { users, tenants, locations } from '@oppsera/db';

export const GET = withMiddleware(async (_request, ctx) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, ctx.user.id),
  });

  // User has no tenant yet — needs onboarding
  if (!ctx.tenantId) {
    return NextResponse.json({
      data: {
        user: {
          id: user?.id,
          email: user?.email,
          name: user?.name,
          isPlatformAdmin: user?.isPlatformAdmin,
        },
        tenant: null,
        locations: [],
        membership: { status: 'none' },
      },
    });
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, ctx.tenantId),
  });

  const tenantLocations = await db.query.locations.findMany({
    where: and(eq(locations.tenantId, ctx.tenantId), eq(locations.isActive, true)),
  });

  return NextResponse.json({
    data: {
      user: {
        id: user?.id,
        email: user?.email,
        name: user?.name,
        isPlatformAdmin: user?.isPlatformAdmin,
      },
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
    },
  });
}, { authenticated: true, requireTenant: false });
