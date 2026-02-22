import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { markDeposited } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await markDeposited(ctx, id);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
