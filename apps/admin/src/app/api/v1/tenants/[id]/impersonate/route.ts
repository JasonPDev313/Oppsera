import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';
import {
  createImpersonationSession,
  createExchangeToken,
} from '@oppsera/core/auth/impersonation';

export const POST = withAdminPermission(
  async (req: NextRequest, session, params) => {
    const tenantId = params?.id;
    if (!tenantId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Missing tenant ID' } },
        { status: 400 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = body.targetUserId as string | undefined;
    const reason = (body.reason as string | undefined)?.trim();
    const maxDurationMinutes = body.maxDurationMinutes as number | undefined;

    // Validate reason (min 10 chars)
    if (!reason || reason.length < 10) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Reason is required (minimum 10 characters)' } },
        { status: 400 },
      );
    }

    // Validate max duration if provided
    if (maxDurationMinutes !== undefined) {
      if (!Number.isInteger(maxDurationMinutes) || maxDurationMinutes < 15 || maxDurationMinutes > 480) {
        return NextResponse.json(
          { error: { code: 'VALIDATION_ERROR', message: 'Duration must be between 15 and 480 minutes' } },
          { status: 400 },
        );
      }
    }

    const impSession = await createImpersonationSession({
      adminId: session.adminId,
      adminEmail: session.email,
      adminName: session.name,
      tenantId,
      targetUserId,
      reason,
      maxDurationMinutes,
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
    void logAdminAudit({
      session,
      action: 'impersonation.started',
      entityType: 'impersonation_session',
      entityId: impSession.id,
      tenantId,
      metadata: {
        targetUserId: targetUserId ?? null,
        reason,
        maxDurationMinutes: impSession.maxDurationMinutes,
        expiresAt: impSession.expiresAt.toISOString(),
      },
    });

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
  { permission: 'impersonation.execute' },
);
