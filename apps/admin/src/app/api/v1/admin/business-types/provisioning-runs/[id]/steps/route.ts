import { NextResponse } from 'next/server';
import { withAdminPermission } from '@/lib/with-admin-permission';
import { listProvisioningRunSteps } from '@oppsera/module-business-types';

export const GET = withAdminPermission(
  async (_req, _session, params) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Missing id' } }, { status: 400 });

    const steps = await listProvisioningRunSteps(id);
    return NextResponse.json({ data: steps });
  },
  { permission: 'system.business_types.view' },
);
