import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getTenderAuditTrail } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tenderId = extractId(request);
    const result = await getTenderAuditTrail({
      tenantId: ctx.tenantId,
      tenderId,
    });

    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tender not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
