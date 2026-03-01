import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getProviderCommissionSummary } from '@oppsera/module-spa';

// GET /api/v1/spa/commissions/summary — get provider commission summary
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const providerId = searchParams.get('providerId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!providerId) {
      throw new ValidationError('Validation failed', [
        { field: 'providerId', message: 'providerId is required' },
      ]);
    }
    if (!startDate) {
      throw new ValidationError('Validation failed', [
        { field: 'startDate', message: 'startDate is required' },
      ]);
    }
    if (!endDate) {
      throw new ValidationError('Validation failed', [
        { field: 'endDate', message: 'endDate is required' },
      ]);
    }

    const result = await getProviderCommissionSummary({
      tenantId: ctx.tenantId,
      providerId,
      startDate,
      endDate,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'spa', permission: 'spa.commissions.view' },
);
