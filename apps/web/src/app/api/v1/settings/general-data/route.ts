import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getBusinessInfoAll } from '@oppsera/core';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const data = await getBusinessInfoAll(ctx.tenantId);
    return NextResponse.json({ data });
  },
  { permission: 'settings.view' },
);
