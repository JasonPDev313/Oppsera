import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getManagerFlashReport, PMS_PERMISSIONS } from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const businessDate = url.searchParams.get('businessDate');

    if (!propertyId || !businessDate) {
      throw new ValidationError('Missing required parameters', [
        ...(!propertyId ? [{ field: 'propertyId', message: 'required' }] : []),
        ...(!businessDate ? [{ field: 'businessDate', message: 'required' }] : []),
      ]);
    }

    const data = await getManagerFlashReport(ctx.tenantId, propertyId, businessDate);
    return NextResponse.json({ data });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REPORTS_VIEW },
);
