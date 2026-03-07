import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { updateBusinessTypeMetadata } from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

export const PATCH = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing id' } }, { status: 400 });

    try {
      const updated = await updateBusinessTypeMetadata(id, { isActive: false }, session.adminId);

      await logAdminAudit({
        session,
        action: 'business_type.deactivated',
        entityType: 'business_type',
        entityId: id,
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: updated });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NOT_FOUND') {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Business type not found' } }, { status: 404 });
      }
      if (msg === 'CANNOT_DEACTIVATE_SIGNUP_VISIBLE') {
        return NextResponse.json({ error: { code: 'CONFLICT', message: 'Cannot deactivate while visible at signup. Hide from signup first.' } }, { status: 409 });
      }
      if (msg === 'SYSTEM_TYPE_IMMUTABLE') {
        return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'System business types cannot be modified' } }, { status: 403 });
      }
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
