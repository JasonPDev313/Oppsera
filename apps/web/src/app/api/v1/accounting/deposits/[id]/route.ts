import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getDepositSlip } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const slip = await getDepositSlip(ctx.tenantId, id);

    if (!slip) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Deposit slip '${id}' not found` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: slip });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
