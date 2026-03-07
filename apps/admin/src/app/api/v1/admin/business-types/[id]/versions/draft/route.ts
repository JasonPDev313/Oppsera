import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { createDraftVersion } from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

export const POST = withAdminPermission(
  async (req, session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing id' } }, { status: 400 });

    try {
      const draft = await createDraftVersion(id, session.adminId);
      if (!draft) throw new Error('Failed to create draft version');

      await logAdminAudit({
        session,
        action: 'business_type_version.draft_created',
        entityType: 'business_type_version',
        entityId: draft.id,
        afterSnapshot: { businessTypeId: id, versionNumber: draft.versionNumber },
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: draft }, { status: 201 });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'BUSINESS_TYPE_NOT_FOUND') {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Business type not found' } }, { status: 404 });
      }
      if (msg === 'DRAFT_EXISTS') {
        return NextResponse.json(
          { error: { code: 'CONFLICT', message: 'A draft version already exists for this business type' } },
          { status: 409 },
        );
      }
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
