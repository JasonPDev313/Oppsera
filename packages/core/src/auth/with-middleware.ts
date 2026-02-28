import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AppError, NotFoundError, AuthorizationError, generateUlid } from '@oppsera/shared';
import { eq, and } from 'drizzle-orm';
import { db, locations, jitterTtlMs, isBreakerOpen } from '@oppsera/db';
import { authenticate, resolveTenant } from './middleware';
import { requestContext } from './context';
import type { RequestContext } from './context';
import { requirePermission } from '../permissions/middleware';
import { requireEntitlement, requireEntitlementWrite } from '../entitlements/middleware';
import { getPermissionEngine } from '../permissions/engine';
import { incrementImpersonationActionCount } from './impersonation';
import { assertImpersonationCanDelete } from './impersonation-safety';
import { checkReplayGuard } from '../security/replay-guard';
import type { StepUpCategory } from '@oppsera/shared';
import type { BotCheckResult } from '../security/bot-detector';

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
  /** When true, validates X-Request-Nonce + X-Request-Timestamp headers to prevent replay attacks. */
  replayGuard?: boolean;
  /** Step-up auth category. When set, requires a valid X-Step-Up-Token header for the specified category. */
  stepUp?: StepUpCategory;
  /** Bot detection mode. 'standard' (default for all routes) or 'strict' for public endpoints. Set to false to disable. */
  botDetection?: 'standard' | 'strict' | false;
}

// ── Global middleware timeout ──────────────────────────────────────────────────
// Caps the entire middleware chain (auth + tenant + location + entitlement + permission + handler).
// If the total time exceeds this, the request is aborted with 504.
// Prevents a single stuck DB query from holding a Vercel function slot indefinitely.
const MIDDLEWARE_TIMEOUT_MS = 25_000;

// ── Location query timeout ────────────────────────────────────────────────────
// Prevents `db.query.locations.findFirst()` from hanging indefinitely.
const LOCATION_QUERY_TIMEOUT_MS = 5_000;

// In-memory location validation cache (60s TTL, 2K entries). Locations rarely change during a session.
// 2K entries × ~50 bytes = ~100KB per instance — negligible memory.
const LOCATION_CACHE_TTL = 60_000;
const LOCATION_CACHE_MAX_SIZE = 2_000;
// Stale entries kept for 5 minutes as fallback when DB is unreachable.
const LOCATION_STALE_WINDOW_MS = 5 * 60 * 1000;
const locationCache = new Map<string, { isActive: boolean; ts: number; ttl: number }>();

function getCachedLocation(tenantId: string, locationId: string): { isActive: boolean } | null {
  const key = `${tenantId}:${locationId}`;
  const entry = locationCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) {
    // Don't delete — keep for stale fallback
    return null;
  }
  // LRU touch: move to end of insertion order
  locationCache.delete(key);
  locationCache.set(key, entry);
  return { isActive: entry.isActive };
}

function getStaleCachedLocation(tenantId: string, locationId: string): { isActive: boolean } | null {
  const key = `${tenantId}:${locationId}`;
  const entry = locationCache.get(key);
  if (!entry) return null;
  const staleDeadline = entry.ts + entry.ttl + LOCATION_STALE_WINDOW_MS;
  if (Date.now() > staleDeadline) {
    locationCache.delete(key);
    return null;
  }
  return { isActive: entry.isActive };
}

function setCachedLocation(tenantId: string, locationId: string, isActive: boolean) {
  const key = `${tenantId}:${locationId}`;
  locationCache.delete(key);
  locationCache.set(key, { isActive, ts: Date.now(), ttl: jitterTtlMs(LOCATION_CACHE_TTL) });
  // Evict oldest entries when over capacity
  if (locationCache.size > LOCATION_CACHE_MAX_SIZE) {
    const keysIter = locationCache.keys();
    const toEvict = locationCache.size - LOCATION_CACHE_MAX_SIZE;
    for (let i = 0; i < toEvict; i++) {
      const { value, done } = keysIter.next();
      if (done) break;
      locationCache.delete(value);
    }
  }
}

/** Wraps a promise with a timeout. Rejects if the promise doesn't resolve within `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function resolveLocation(
  request: NextRequest,
  ctx: RequestContext,
): Promise<string | undefined> {
  const fromHeader = request.headers.get('x-location-id');
  const locationId = fromHeader || new URL(request.url).searchParams.get('locationId') || undefined;

  if (!locationId) return undefined;

  // Check in-memory cache first (avoids DB round-trip for hot POS paths)
  const cached = getCachedLocation(ctx.tenantId, locationId);
  if (cached) {
    if (!cached.isActive) throw new NotFoundError('Location');
  } else if (isBreakerOpen()) {
    // Circuit breaker open — fall back to stale cache to avoid queuing more DB load
    const stale = getStaleCachedLocation(ctx.tenantId, locationId);
    if (stale) {
      console.warn(`[location] Circuit breaker open, using stale cache for ${ctx.tenantId}:${locationId}`);
      if (!stale.isActive) throw new NotFoundError('Location');
    } else {
      // No stale data — let the request through (location will be validated by RLS)
      console.warn(`[location] Circuit breaker open, no stale cache for ${ctx.tenantId}:${locationId} — skipping validation`);
    }
  } else {
    try {
      const location = await withTimeout(
        db.query.locations.findFirst({
          where: and(
            eq(locations.id, locationId),
            eq(locations.tenantId, ctx.tenantId),
          ),
        }),
        LOCATION_QUERY_TIMEOUT_MS,
        'location query',
      );

      if (!location) {
        throw new NotFoundError('Location');
      }

      setCachedLocation(ctx.tenantId, locationId, location.isActive);

      if (!location.isActive) {
        throw new NotFoundError('Location');
      }
    } catch (err) {
      // On timeout or DB error, try stale cache as fallback
      if (err instanceof NotFoundError) throw err;
      const stale = getStaleCachedLocation(ctx.tenantId, locationId);
      if (stale) {
        console.warn(`[location] DB query failed, using stale cache for ${ctx.tenantId}:${locationId}: ${(err as Error).message}`);
        if (!stale.isActive) throw new NotFoundError('Location');
      } else {
        throw err;
      }
    }
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
    const startTime = Date.now();
    let _trackTenantId = '';
    let _trackUserId = '';
    try {
      // Global timeout — caps the entire middleware+handler chain.
      // Prevents a single stuck DB query from holding a Vercel function slot indefinitely.
      const result = await withTimeout(
        _executeMiddleware(request, handler, options, startTime, (tId, uId) => {
          _trackTenantId = tId;
          _trackUserId = uId;
        }),
        MIDDLEWARE_TIMEOUT_MS,
        'middleware chain',
      );
      return result;
    } catch (error) {
      // Middleware timeout → 504 Gateway Timeout
      if (error instanceof Error && error.message.includes('timed out')) {
        const duration = Date.now() - startTime;
        console.error(`[middleware] Request timed out after ${duration}ms: ${request.method} ${new URL(request.url).pathname}`);
        return NextResponse.json(
          { error: { code: 'GATEWAY_TIMEOUT', message: 'Request timed out. Please retry.' } },
          { status: 504 },
        );
      }
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
    } finally {
      // Usage tracking — truly fire-and-forget (no await, never delays response)
      if (_trackTenantId) {
        const _tId = _trackTenantId;
        const _uId = _trackUserId || 'unknown';
        const _method = request.method;
        const _duration = Date.now() - startTime;
        const _ts = Date.now();
        const _ent = options?.entitlement;
        const _perm = options?.permission;
        void Promise.all([
          import('../usage/tracker'),
          import('../usage/workflow-registry'),
        ]).then(([{ recordUsage }, { resolveModuleKey }]) => {
          recordUsage({
            tenantId: _tId,
            userId: _uId,
            moduleKey: resolveModuleKey(_ent, _perm),
            workflowKey: _perm || '',
            method: _method,
            statusCode: 0, // we don't have the response here since it's in finally
            durationMs: _duration,
            timestamp: _ts,
          });
        }).catch(() => { /* never fail the request */ });
      }
    }
  };
}

/** Extract client IP from request headers (Vercel x-forwarded-for or x-real-ip). */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/** Internal: executes the full middleware chain. Wrapped by withTimeout in withMiddleware. */
async function _executeMiddleware(
  request: NextRequest,
  handler: RouteHandler,
  options: MiddlewareOptions | undefined,
  _startTime: number,
  trackIds: (tenantId: string, userId: string) => void,
): Promise<NextResponse> {
      let response: NextResponse;

      // ── Bot detection (runs BEFORE auth to catch unauthenticated scanners) ──
      if (options?.botDetection !== false) {
        try {
          const { checkBotScore } = await import('../security/bot-detector');
          const botResult: BotCheckResult = checkBotScore(request, options?.botDetection ?? 'standard');
          if (botResult.blocked) {
            return NextResponse.json(
              { error: { code: 'TOO_MANY_REQUESTS', message: 'Request rate exceeded' } },
              { status: 429, headers: { 'Retry-After': String(botResult.retryAfterSec) } },
            );
          }
        } catch {
          // Bot detector not yet loaded — allow through
        }
      }

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
          trackIds(ctx.tenantId, user.id);
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

          // ── Replay guard (after auth, before handler) ──
          if (options?.replayGuard) {
            const rgResult = checkReplayGuard(request);
            if (!rgResult.allowed) {
              return NextResponse.json(
                { error: { code: 'REPLAY_DETECTED', message: 'Request replay detected' } },
                { status: 409 },
              );
            }
          }

          // ── Step-up auth (after permissions, before handler) ──
          if (options?.stepUp) {
            const { requireStepUp } = await import('../security/step-up-auth');
            requireStepUp(request, ctx, options.stepUp);
          }

          // Impersonation safety: block all DELETE requests during impersonation
          if (ctx.impersonation && request.method === 'DELETE') {
            assertImpersonationCanDelete(ctx);
          }

          trackIds(ctx.tenantId, ctx.user.id);

          response = await requestContext.run(ctx, () => handler(request, ctx));

          // Track impersonation action count (fire-and-forget)
          if (ctx.impersonation) {
            incrementImpersonationActionCount(ctx.impersonation.sessionId).catch(() => {});
          }

          // Record response status for bot detection scoring (fire-and-forget)
          if (options?.botDetection !== false) {
            try {
              const { recordBotResponseStatus } = await import('../security/bot-detector');
              recordBotResponseStatus(getClientIp(request), response.status);
            } catch {
              // Bot detector not loaded — skip
            }
          }
        }
      }

      // Apply Cache-Control header to GET responses when configured
      if (options?.cache && request.method === 'GET') {
        response.headers.set('Cache-Control', options.cache);
      }

      return response;
}
