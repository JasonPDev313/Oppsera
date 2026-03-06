import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSubDepartmentMappings } from '@oppsera/module-accounting';

// Allow extra time — complex CTE with 5 LEFT JOINs across catalog + GL accounts
export const maxDuration = 30;

// GET /api/v1/accounting/mappings/sub-departments — list all sub-departments with GL mappings
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await getSubDepartmentMappings({ tenantId: ctx.tenantId });
    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
