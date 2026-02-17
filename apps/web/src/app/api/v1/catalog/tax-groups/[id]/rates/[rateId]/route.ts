import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { removeTaxRateFromGroup } from '@oppsera/module-catalog';

function extractIds(request: NextRequest): { taxGroupId: string; taxRateId: string } {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/tax-groups/:id/rates/:rateId
  return {
    taxGroupId: parts[parts.length - 3]!,
    taxRateId: parts[parts.length - 1]!,
  };
}

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { taxGroupId, taxRateId } = extractIds(request);
    await removeTaxRateFromGroup(ctx, { taxGroupId, taxRateId });
    return new NextResponse(null, { status: 204 });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
