import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { postSettlement } from '@oppsera/module-accounting';

function extractSettlementId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const settlementId = extractSettlementId(request);
    let force = false;

    try {
      const body = await request.json();
      force = body.force === true;
    } catch {
      // No body is fine — defaults to force=false
    }

    const result = await postSettlement(ctx, { settlementId, force });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
