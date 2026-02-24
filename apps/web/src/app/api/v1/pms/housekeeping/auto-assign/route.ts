import { NextResponse } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { PMS_PERMISSIONS } from '@oppsera/module-pms';

export const POST = withMiddleware(
  async () => {
    return NextResponse.json(
      { error: { code: 'NOT_IMPLEMENTED', message: 'Auto-assign not yet implemented' } },
      { status: 501 },
    );
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.HOUSEKEEPING_ASSIGN, writeAccess: true },
);
