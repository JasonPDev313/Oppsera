import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyPortalToken, type PortalSession } from './portal-auth';

export interface PortalContext {
  session: PortalSession;
}

type PortalHandler = (
  request: NextRequest,
  ctx: PortalContext,
) => Promise<NextResponse>;

/**
 * Middleware wrapper for portal API routes.
 * Validates the portal JWT from the cookie and injects session into handler.
 */
export function withPortalAuth(handler: PortalHandler): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    try {
      const isDevBypass = process.env.PORTAL_DEV_BYPASS === 'true' && process.env.NODE_ENV !== 'production';

      // Always try cookie first (login sets real tenant/customer IDs in the JWT)
      const token = request.cookies.get('portal_session')?.value;
      if (token) {
        const session = await verifyPortalToken(token);
        if (session) {
          return handler(request, { session });
        }
      }

      // Dev bypass fallback: accept header overrides when no valid cookie
      if (isDevBypass) {
        const devSession: PortalSession = {
          customerId: request.headers.get('x-portal-customer-id') ?? 'dev-customer',
          tenantId: request.headers.get('x-portal-tenant-id') ?? 'dev-tenant',
          email: request.headers.get('x-portal-email') ?? 'dev@example.com',
        };
        return handler(request, { session: devSession });
      }

      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
        { status: 401 },
      );
    } catch (err: any) {
      console.error('Portal auth error:', err);
      return NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Authentication error' } },
        { status: 500 },
      );
    }
  };
}
