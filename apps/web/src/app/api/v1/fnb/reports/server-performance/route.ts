import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { getServerPerformance, getServerPerformanceSchema } from '@oppsera/module-fnb';
import { parseLimit } from '@/lib/api-params';

// GET /api/v1/fnb/reports/server-performance — get server performance
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = getServerPerformanceSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') ?? ctx.locationId ?? '',
      startDate: url.searchParams.get('startDate') ?? '',
      endDate: url.searchParams.get('endDate') ?? '',
      serverUserId: url.searchParams.get('serverUserId') || undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await getServerPerformance(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.reports.view' },
);
