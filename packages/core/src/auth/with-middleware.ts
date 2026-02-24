import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AppError, NotFoundError, AuthorizationError, generateUlid } from '@oppsera/shared';
import { eq, and } from 'drizzle-orm';
import { db, locations } from '@oppsera/db';
import { authenticate, resolveTenant } from './middleware';
import { requestContext } from './context';
import type { RequestContext } from './context';
import { requirePermission } from '../permissions/middleware';
import { requireEntitlement, requireEntitlementWrite } from '../entitlements/middleware';
import { getPermissionEngine } from '../permissions/engine';
import { incrementImpersonationActionCount } from './impersonation';

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
  /** When true, requires FULL access mode (blocks VIEW). Default: false (allows VIEW through). */
  writeAccess?: boolean;
  /** Cache-Control header value for GET requests. e.g., 'private, max-age=60, stale-while-revalidate=300' */
  cache?: string;
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

  // Impersonation sessions skip the role assignment check —
  // the admin has no role_assignments in the tenant.
  if (!ctx.impersonation) {
    // Verify user has at least one role assignment for this location (or a tenant-wide role).
    // Uses the permission engine's 15s cache — no extra DB query on hot path.
    const permissions = await getPermissionEngine().getUserPermissions(
      ctx.tenantId,
      ctx.user.id,
      locationId,
    );
    if (permissions.size === 0) {
      throw new AuthorizationError('No access to this location');
    }
  }

  return locationId;
}

export function withMiddleware(handler: RouteHandler, options?: MiddlewareOptions) {
  return async (request: NextRequest) => {
    try {
      let response: NextResponse;

      if (options?.public) {
        const ctx: RequestContext = {
          user: null as unknown as RequestContext['user'],
          tenantId: '',
          requestId: generateUlid(),
          isPlatformAdmin: false,
        };
        response = await handler(request, ctx);
      } else {
        const user = await authenticate(request);

        // authenticated-only mode: skip tenant resolution (for pre-tenant endpoints like onboard)
        if (options?.authenticated && options?.requireTenant === false) {
          const ctx: RequestContext = {
            user,
            tenantId: user.tenantId || '',
            requestId: generateUlid(),
            isPlatformAdmin: false,
          };
          response = await requestContext.run(ctx, () => handler(request, ctx));
        } else {
          const ctx = await resolveTenant(user);

          const locationId = await resolveLocation(request, ctx);
          if (locationId) {
            ctx.locationId = locationId;
          }

          // Read active role from header (set by frontend when user selects a role)
          const activeRoleId = request.headers.get('x-role-id') || undefined;
          if (activeRoleId) {
            ctx.activeRoleId = activeRoleId;
          }

          if (options?.entitlement) {
            if (options.writeAccess) {
              await requireEntitlementWrite(options.entitlement)(ctx);
            } else {
              await requireEntitlement(options.entitlement)(ctx);
            }
          }

          if (options?.permission) {
            await requirePermission(options.permission)(ctx);
          }

          response = await requestContext.run(ctx, () => handler(request, ctx));

          // Track impersonation action count (fire-and-forget)
          if (ctx.impersonation) {
            incrementImpersonationActionCount(ctx.impersonation.sessionId).catch(() => {});
          }
        }
      }

      // Apply Cache-Control header to GET responses when configured
      if (options?.cache && request.method === 'GET') {
        response.headers.set('Cache-Control', options.cache);
      }

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        return NextResponse.json(
          { error: { code: error.code, message: error.message, details: error.details } },
          { status: error.statusCode },
        );
      }
      const rawMsg = error instanceof Error ? error.message : String(error);
      console.error('Unhandled error in route handler:', rawMsg, error);

      // Surface DB schema mismatch errors clearly — most common cause of 500s during development
      const isDbSchemaError = rawMsg.includes('column') || rawMsg.includes('relation') || rawMsg.includes('does not exist');
      const userMsg = isDbSchemaError
        ? `Database schema mismatch — run pending migrations (pnpm db:migrate). Detail: ${rawMsg}`
        : process.env.NODE_ENV === 'development'
          ? rawMsg
          : 'An unexpected error occurred';

      return NextResponse.json(
        { error: { code: isDbSchemaError ? 'SCHEMA_MISMATCH' : 'INTERNAL_ERROR', message: userMsg } },
        { status: 500 },
      );
    }
  };
}
