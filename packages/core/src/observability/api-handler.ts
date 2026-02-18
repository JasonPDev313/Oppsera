/**
 * Enhanced route handler wrapper — integrates structured logging, metrics,
 * error tracking, and Sentry context on top of the existing withMiddleware.
 *
 * Usage:
 *   export const GET = withApi(
 *     async (req, ctx) => {
 *       const result = await listOrders({ tenantId: ctx.tenantId });
 *       return { data: result.orders, meta: { cursor: result.cursor, hasMore: result.hasMore } };
 *     },
 *     { entitlement: 'orders', permission: 'orders.view' },
 *   );
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AppError, generateUlid } from '@oppsera/shared';
import { logger } from './logger';
import { captureException } from './sentry-context';
import { metricsStore, createRequestMetrics } from './request-metrics';
import type { RequestContext } from '../auth/context';
import { requestContext } from '../auth/context';
import { authenticate, resolveTenant } from '../auth/middleware';
import { requirePermission } from '../permissions/middleware';
import { requireEntitlement } from '../entitlements/middleware';
import { eq, and } from 'drizzle-orm';
import { db, locations, sql } from '@oppsera/db';

type ApiResult = Record<string, unknown> | { data: unknown; meta?: unknown };

type ApiHandler = (
  request: NextRequest,
  context: RequestContext,
) => Promise<ApiResult | NextResponse>;

interface ApiOptions {
  public?: boolean;
  authenticated?: boolean;
  requireTenant?: boolean;
  permission?: string;
  entitlement?: string;
  successStatus?: number;
}

async function resolveLocationForApi(
  request: NextRequest,
  ctx: RequestContext,
): Promise<string | undefined> {
  const fromHeader = request.headers.get('x-location-id');
  const locationId = fromHeader || new URL(request.url).searchParams.get('locationId') || undefined;
  if (!locationId) return undefined;

  const location = await db.query.locations.findFirst({
    where: and(eq(locations.id, locationId), eq(locations.tenantId, ctx.tenantId)),
  });

  if (!location || !location.isActive) return undefined;

  await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, false)`);
  return locationId;
}

export function withApi(handler: ApiHandler, options?: ApiOptions) {
  return async (request: NextRequest) => {
    const metrics = createRequestMetrics();
    const url = new URL(request.url);

    return metricsStore.run(metrics, async () => {
      let tenantId: string | undefined;
      let userId: string | undefined;
      let reqId = generateUlid();

      try {
        // ── Public endpoints ──
        if (options?.public) {
          const ctx: RequestContext = {
            user: null as unknown as RequestContext['user'],
            tenantId: '',
            requestId: reqId,
            isPlatformAdmin: false,
          };
          const result = await handler(request, ctx);
          const response = result instanceof NextResponse
            ? result
            : NextResponse.json(result, { status: options?.successStatus ?? 200 });
          logRequest(request, response, metrics, reqId, tenantId, userId);
          return response;
        }

        // ── Authenticated ──
        const user = await authenticate(request);
        userId = user.id;

        if (options?.authenticated && options?.requireTenant === false) {
          const ctx: RequestContext = {
            user,
            tenantId: user.tenantId || '',
            requestId: reqId,
            isPlatformAdmin: false,
          };
          tenantId = ctx.tenantId;
          return await requestContext.run(ctx, async () => {
            const result = await handler(request, ctx);
            const response = result instanceof NextResponse
              ? result
              : NextResponse.json(result, { status: options?.successStatus ?? 200 });
            logRequest(request, response, metrics, reqId, tenantId, userId);
            return response;
          });
        }

        // ── Full tenant context ──
        const ctx = await resolveTenant(user);
        reqId = ctx.requestId;
        tenantId = ctx.tenantId;

        const locationId = await resolveLocationForApi(request, ctx);
        if (locationId) ctx.locationId = locationId;

        if (options?.entitlement) {
          await requireEntitlement(options.entitlement)(ctx);
        }
        if (options?.permission) {
          await requirePermission(options.permission)(ctx);
        }

        return await requestContext.run(ctx, async () => {
          const result = await handler(request, ctx);
          const response = result instanceof NextResponse
            ? result
            : NextResponse.json(result, { status: options?.successStatus ?? 200 });
          logRequest(request, response, metrics, reqId, tenantId, userId);
          return response;
        });
      } catch (error) {
        const durationMs = Date.now() - metrics.startTime;

        if (error instanceof AppError) {
          logger.warn(`${request.method} ${url.pathname} → ${error.statusCode}`, {
            requestId: reqId,
            tenantId,
            userId,
            method: request.method,
            path: url.pathname,
            statusCode: error.statusCode,
            durationMs,
            dbQueryCount: metrics.dbQueryCount,
            dbQueryTimeMs: metrics.dbQueryTimeMs,
            coldStart: metrics.coldStart,
            region: process.env.VERCEL_REGION,
            error: { code: error.code, message: error.message },
          });
          return NextResponse.json(
            { error: { code: error.code, message: error.message, details: error.details } },
            { status: error.statusCode },
          );
        }

        const msg = error instanceof Error ? error.message : 'An unexpected error occurred';
        const stack = error instanceof Error ? error.stack : undefined;

        logger.error(`${request.method} ${url.pathname} → 500`, {
          requestId: reqId,
          tenantId,
          userId,
          method: request.method,
          path: url.pathname,
          statusCode: 500,
          durationMs,
          dbQueryCount: metrics.dbQueryCount,
          dbQueryTimeMs: metrics.dbQueryTimeMs,
          coldStart: metrics.coldStart,
          region: process.env.VERCEL_REGION,
          error: {
            message: msg,
            stack: process.env.NODE_ENV !== 'production' ? stack : undefined,
          },
        });

        // Capture to Sentry if available
        captureException(error, {
          path: url.pathname,
          method: request.method,
          tenantId,
          requestId: reqId,
        });

        const devMsg = process.env.NODE_ENV === 'development' ? msg : 'An unexpected error occurred';
        return NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: devMsg } },
          { status: 500 },
        );
      }
    });
  };
}

function logRequest(
  request: NextRequest,
  response: NextResponse,
  metrics: ReturnType<typeof createRequestMetrics>,
  requestId: string,
  tenantId?: string,
  userId?: string,
): void {
  const url = new URL(request.url);
  const durationMs = Date.now() - metrics.startTime;
  const status = response.status;

  logger.info(`${request.method} ${url.pathname} → ${status}`, {
    requestId,
    tenantId,
    userId,
    method: request.method,
    path: url.pathname,
    statusCode: status,
    durationMs,
    dbQueryCount: metrics.dbQueryCount,
    dbQueryTimeMs: metrics.dbQueryTimeMs,
    coldStart: metrics.coldStart,
    region: process.env.VERCEL_REGION,
    userAgent: request.headers.get('user-agent') ?? undefined,
  });
}
