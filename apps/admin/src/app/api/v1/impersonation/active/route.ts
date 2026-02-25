import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getActiveSessionForAdmin } from '@oppsera/core/auth/impersonation';

export const GET = withAdminPermission(async (_req: NextRequest, session) => {
  const active = await getActiveSessionForAdmin(session.adminId);

  if (!active) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({
    data: {
      id: active.id,
      adminId: active.adminId,
      adminEmail: active.adminEmail,
      adminName: active.adminName,
      tenantId: active.tenantId,
      tenantName: active.tenantName,
      targetUserId: active.targetUserId,
      reason: active.reason,
      maxDurationMinutes: active.maxDurationMinutes,
      status: active.status,
      startedAt: active.startedAt?.toISOString() ?? null,
      actionCount: active.actionCount,
      expiresAt: active.expiresAt.toISOString(),
      createdAt: active.createdAt.toISOString(),
    },
  });
}, { permission: 'impersonation.execute' });
