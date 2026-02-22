import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSettlement } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const settlement = await getSettlement({
      tenantId: ctx.tenantId,
      settlementId: id,
    });

    if (!settlement) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Settlement '${id}' not found` } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: settlement });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
