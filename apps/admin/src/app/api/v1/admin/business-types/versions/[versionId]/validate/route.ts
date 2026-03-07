import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { validateForPublish } from '@oppsera/module-business-types';

export const GET = withAdminPermission(
  async (_req, _session, params) => {
    const versionId = params?.versionId;
    if (!versionId) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing versionId' } }, { status: 400 });

    const result = await validateForPublish(versionId);
    return NextResponse.json({ data: result });
  },
  { permission: 'system.business_types.view' },
);
