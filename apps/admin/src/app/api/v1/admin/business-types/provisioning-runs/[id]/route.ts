import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { getProvisioningRun } from '@oppsera/module-business-types';

export const GET = withAdminPermission(
  async (_req, _session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing id' } }, { status: 400 });

    const run = await getProvisioningRun(id);
    if (!run) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Provisioning run not found' } }, { status: 404 });
    }

    return NextResponse.json({ data: run });
  },
  { permission: 'system.business_types.view' },
);
