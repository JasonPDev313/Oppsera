import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AppError, NotFoundError, generateUlid } from '@oppsera/shared';
import { eq, and } from 'drizzle-orm';
import { db, locations, sql } from '@oppsera/db';
import { authenticate, resolveTenant } from './middleware';
import { requestContext } from './context';
import type { RequestContext } from './context';
import { requirePermission } from '../permissions/middleware';
import { requireEntitlement } from '../entitlements/middleware';

type RouteHandler = (
  request: NextRequest,
  context: RequestContext,
) => Promise<NextResponse>;

interface MiddlewareOptions {
  public?: boolean;
  authenticated?: boolean;
  requireTenant?: boolean;
  permission?: string;
  entitlement?: string;
}

async function resolveLocation(
  request: NextRequest,
  ctx: RequestContext,
): Promise<string | undefined> {
  const fromHeader = request.headers.get('x-location-id');
  const locationId = fromHeader || new URL(request.url).searchParams.get('locationId') || undefined;

  if (!locationId) return undefined;

  const location = await db.query.locations.findFirst({
    where: and(
      eq(locations.id, locationId),
      eq(locations.tenantId, ctx.tenantId),
    ),
  });

  if (!location) {
    throw new NotFoundError('Location');
  }

  if (!location.isActive) {
    throw new NotFoundError('Location');
  }

  await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

  return locationId;
}

export function withMiddleware(handler: RouteHandler, options?: MiddlewareOptions) {
  return async (request: NextRequest) => {
    try {
      if (options?.public) {
        const ctx: RequestContext = {
          user: null as unknown as RequestContext['user'],
          tenantId: '',
          requestId: generateUlid(),
          isPlatformAdmin: false,
        };
        return await handler(request, ctx);
      }

      const user = await authenticate(request);

      // authenticated-only mode: skip tenant resolution (for pre-tenant endpoints like onboard)
      if (options?.authenticated && options?.requireTenant === false) {
        const ctx: RequestContext = {
          user,
          tenantId: user.tenantId || '',
          requestId: generateUlid(),
          isPlatformAdmin: false,
        };
        return await requestContext.run(ctx, () => handler(request, ctx));
      }

      const ctx = await resolveTenant(user);

      const locationId = await resolveLocation(request, ctx);
      if (locationId) {
        ctx.locationId = locationId;
      }

      if (options?.entitlement) {
        await requireEntitlement(options.entitlement)(ctx);
      }

      if (options?.permission) {
        await requirePermission(options.permission)(ctx);
      }

      return await requestContext.run(ctx, () => handler(request, ctx));
    } catch (error) {
      if (error instanceof AppError) {
        return NextResponse.json(
          { error: { code: error.code, message: error.message, details: error.details } },
          { status: error.statusCode },
        );
      }
      console.error('Unhandled error in route handler:', error);
      const devMsg = process.env.NODE_ENV === 'development' && error instanceof Error
        ? error.message
        : 'An unexpected error occurred';
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: devMsg } },
        { status: 500 },
      );
    }
  };
}
