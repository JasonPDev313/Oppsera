import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { removeServiceFlag } from '@oppsera/module-customers';

function extractFlagId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

// DELETE /api/v1/customers/:id/service-flags/:flagId — remove service flag
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const flagId = extractFlagId(request);
    await removeServiceFlag(ctx, { flagId });
    return new NextResponse(null, { status: 204 });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
