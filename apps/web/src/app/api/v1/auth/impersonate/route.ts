import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  verifyExchangeToken,
  activateImpersonationSession,
  getActiveImpersonationSession,
  createImpersonationAccessToken,
  createImpersonationRefreshToken,
} from '@oppsera/core/auth/impersonation';
import { AppError, ValidationError } from '@oppsera/shared';

const schema = z.object({ token: z.string().min(1) });

export const POST = withMiddleware(
  async (request) => {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid request',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const claims = verifyExchangeToken(parsed.data.token);
    if (!claims) {
      throw new AppError('INVALID_TOKEN', 'Invalid or expired impersonation token', 401);
    }

    // Verify session is still valid (pending or active, not expired)
    const session = await getActiveImpersonationSession(claims.sessionId);
    if (!session) {
      throw new AppError('SESSION_EXPIRED', 'Impersonation session expired or already used', 401);
    }

    // Activate the session
    await activateImpersonationSession(claims.sessionId);

    // Generate access/refresh tokens for the web app
    const tokenPayload = {
      sub: `admin:${claims.adminId}`,
      imp: {
        sessionId: claims.sessionId,
        adminId: claims.adminId,
        adminEmail: claims.adminEmail,
        tenantId: claims.tenantId,
      },
    };

    const accessToken = createImpersonationAccessToken(tokenPayload);
    const refreshToken = createImpersonationRefreshToken(tokenPayload);

    return NextResponse.json({
      data: {
        accessToken,
        refreshToken,
        impersonation: {
          sessionId: claims.sessionId,
          adminEmail: claims.adminEmail,
          adminName: session.adminName,
          tenantName: session.tenantName,
          expiresAt: session.expiresAt.toISOString(),
        },
      },
    });
  },
  { public: true },
);
