import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { archiveVersion } from '@oppsera/module-business-types';
import { logAdminAudit, getClientIp } from '@/lib/admin-audit';

export const POST = withAdminPermission(
  async (req, session, params) => {
    const versionId = params?.versionId;
    if (!versionId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing versionId' } }, { status: 400 });

    try {
      const archived = await archiveVersion(versionId, session.adminId);

      await logAdminAudit({
        session,
        action: 'business_type_version.archived',
        entityType: 'business_type_version',
        entityId: versionId,
        ipAddress: getClientIp(req) ?? undefined,
      });

      return NextResponse.json({ data: archived });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'NOT_FOUND') {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Version not found' } }, { status: 404 });
      }
      if (msg === 'ALREADY_ARCHIVED') {
        return NextResponse.json({ error: { code: 'CONFLICT', message: 'Version is already archived' } }, { status: 409 });
      }
      if (msg === 'CANNOT_ARCHIVE_PUBLISHED') {
        return NextResponse.json({ error: { code: 'CONFLICT', message: 'Published versions cannot be archived directly. Publish a new version first.' } }, { status: 409 });
      }
      throw err;
    }
  },
  { permission: 'system.business_types.edit' },
);
