import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getBankReconciliation } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 1]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const result = await getBankReconciliation({
      tenantId: ctx.tenantId,
      reconciliationId: id,
    });
    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Bank reconciliation not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
