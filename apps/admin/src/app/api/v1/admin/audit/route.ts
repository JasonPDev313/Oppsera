import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { listAdminAuditLog } from '@/lib/staff-queries';

// ── GET /api/v1/admin/audit — List platform admin audit log ─────

export const GET = withAdminPermission(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const result = await listAdminAuditLog({
      adminId: params.get('adminId') ?? undefined,
      entityType: params.get('entityType') ?? undefined,
      entityId: params.get('entityId') ?? undefined,
      cursor: params.get('cursor') ?? undefined,
      limit: params.get('limit') ? Number(params.get('limit')) : undefined,
    });
    return NextResponse.json({ data: result });
  },
  { permission: 'system.view' },
);
