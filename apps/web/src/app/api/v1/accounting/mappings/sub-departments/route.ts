import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getSubDepartmentMappings } from '@oppsera/module-accounting';

// GET /api/v1/accounting/mappings/sub-departments — list all sub-departments with GL mappings
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await getSubDepartmentMappings({ tenantId: ctx.tenantId });
    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
