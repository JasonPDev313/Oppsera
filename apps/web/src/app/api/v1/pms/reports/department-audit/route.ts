import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getDepartmentAuditReport, PMS_PERMISSIONS } from '@oppsera/module-pms';
import { ValidationError } from '@oppsera/shared';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get('propertyId');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const department = url.searchParams.get('department') ?? undefined;

    // Required params
    const missing: { field: string; message: string }[] = [];
    if (!propertyId) missing.push({ field: 'propertyId', message: 'required' });
    if (!startDate) missing.push({ field: 'startDate', message: 'required' });
    if (!endDate) missing.push({ field: 'endDate', message: 'required' });
    if (missing.length > 0) {
      throw new ValidationError('Missing required parameters', missing);
    }

    // Format validation
    if (!ISO_DATE_RE.test(startDate!)) {
      throw new ValidationError('Invalid startDate format', [
        { field: 'startDate', message: 'must be YYYY-MM-DD' },
      ]);
    }
    if (!ISO_DATE_RE.test(endDate!)) {
      throw new ValidationError('Invalid endDate format', [
        { field: 'endDate', message: 'must be YYYY-MM-DD' },
      ]);
    }

    // Range validation
    if (endDate! < startDate!) {
      throw new ValidationError('Invalid date range', [
        { field: 'endDate', message: 'must be >= startDate' },
      ]);
    }

    const result = await getDepartmentAuditReport(
      ctx.tenantId,
      propertyId!,
      startDate!,
      endDate!,
      department,
    );
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.REPORTS_VIEW },
);
