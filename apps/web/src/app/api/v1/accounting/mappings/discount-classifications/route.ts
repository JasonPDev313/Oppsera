import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getDiscountGlMappings,
  saveDiscountGlMappingsBatch,
} from '@oppsera/module-accounting';

// GET /api/v1/accounting/mappings/discount-classifications — list all discount GL mappings
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await getDiscountGlMappings(ctx.tenantId);
    return NextResponse.json({ data: items });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// PUT /api/v1/accounting/mappings/discount-classifications — batch save
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();

    if (!body.mappings || !Array.isArray(body.mappings)) {
      throw new ValidationError('mappings array is required');
    }

    for (const m of body.mappings) {
      if (!m.subDepartmentId || !m.classification || !m.glAccountId) {
        throw new ValidationError(
          'Each mapping requires subDepartmentId, classification, and glAccountId',
        );
      }
    }

    const result = await saveDiscountGlMappingsBatch(ctx, { mappings: body.mappings });
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
