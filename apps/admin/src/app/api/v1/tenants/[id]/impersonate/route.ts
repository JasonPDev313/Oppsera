import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/with-admin-auth';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';
import {
  createImpersonationSession,
  createExchangeToken,
} from '@oppsera/core/auth/impersonation';

export const POST = withAdminAuth(
  async (req, session, params) => {
    const tenantId = params?.id;
    if (!tenantId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Missing tenant ID' } },
        { status: 400 },
      );
    }

    const impSession = await createImpersonationSession({
      adminId: session.adminId,
      adminEmail: session.email,
      adminName: session.name,
      tenantId,
      ipAddress: getClientIp(req) ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    const exchangeToken = createExchangeToken({
      type: 'impersonation',
      sessionId: impSession.id,
      adminId: session.adminId,
      adminEmail: session.email,
      adminName: session.name,
      tenantId,
    });

    // Audit log (best-effort)
    logAdminAudit({
      session,
      action: 'tenant.impersonation.started',
      entityType: 'tenant',
      entityId: tenantId,
      tenantId,
      metadata: {
        impersonationSessionId: impSession.id,
        expiresAt: impSession.expiresAt.toISOString(),
      },
    }).catch(() => {});

    const webAppUrl = process.env.NEXT_PUBLIC_WEB_APP_URL || 'http://localhost:3000';
    const impersonateUrl = `${webAppUrl}/impersonate?token=${exchangeToken}`;

    return NextResponse.json({
      data: {
        url: impersonateUrl,
        sessionId: impSession.id,
        expiresAt: impSession.expiresAt.toISOString(),
      },
    });
  },
  'admin',
);
