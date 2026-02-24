import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { removePaymentMethod, PMS_PERMISSIONS } from '@oppsera/module-pms';

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1]!;
    const result = await removePaymentMethod(ctx, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.PAYMENTS_CHARGE, writeAccess: true },
);
