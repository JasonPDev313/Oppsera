import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { dismissAlert } from '@oppsera/module-customers';

function extractAlertId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/customers/:id/alerts/:alertId/dismiss — dismiss customer alert
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const alertId = extractAlertId(request);
    const result = await dismissAlert(ctx, { alertId });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
