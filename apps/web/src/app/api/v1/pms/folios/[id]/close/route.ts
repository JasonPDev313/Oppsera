import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  PMS_PERMISSIONS,
  closeFolio,
} from '@oppsera/module-pms';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 2]!; // /folios/[id]/close
    const result = await closeFolio(ctx, id);
    return NextResponse.json({ data: result });
  },
  { permission: PMS_PERMISSIONS.FOLIO_POST_CHARGES, entitlement: 'pms' },
);
