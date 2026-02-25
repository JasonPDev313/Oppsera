import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { listImpersonationHistory } from '@oppsera/core/auth/impersonation';

export const GET = withAdminPermission(async (req: NextRequest) => {
  const url = new URL(req.url);
  const adminId = url.searchParams.get('adminId') ?? undefined;
  const tenantId = url.searchParams.get('tenantId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined;

  const result = await listImpersonationHistory({ adminId, tenantId, status, cursor, limit });

  return NextResponse.json({
    data: {
      items: result.items.map((s) => ({
        id: s.id,
        adminId: s.adminId,
        adminEmail: s.adminEmail,
        adminName: s.adminName,
        tenantId: s.tenantId,
        tenantName: s.tenantName,
        targetUserId: s.targetUserId,
        reason: s.reason,
        maxDurationMinutes: s.maxDurationMinutes,
        status: s.status,
        startedAt: s.startedAt?.toISOString() ?? null,
        endedAt: s.endedAt?.toISOString() ?? null,
        actionCount: s.actionCount,
        expiresAt: s.expiresAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    },
  });
}, { permission: 'impersonation.read' });
