import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getActivityByDay, PMS_PERMISSIONS } from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const businessDate = url.searchParams.get('businessDate');

    const errors: { field: string; message: string }[] = [];
    if (!propertyId) errors.push({ field: 'propertyId', message: 'required' });
    if (!businessDate) {
      errors.push({ field: 'businessDate', message: 'required' });
    } else if (!DATE_RE.test(businessDate)) {
      errors.push({ field: 'businessDate', message: 'must be YYYY-MM-DD' });
    } else {
      const parsed = new Date(businessDate + 'T00:00:00');
      if (Number.isNaN(parsed.getTime())) {
        errors.push({ field: 'businessDate', message: 'invalid date' });
      }
      // Guard against far-future scans — allow up to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (parsed > tomorrow) {
        errors.push({ field: 'businessDate', message: 'cannot be in the future' });
      }
    }
    if (errors.length > 0) {
      throw new ValidationError('Invalid parameters', errors);
    }

    const report = await getActivityByDay(ctx.tenantId, propertyId!, businessDate!);
    return NextResponse.json({ data: report });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REPORTS_VIEW },
);
