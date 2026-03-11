import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getCourseRulesForPos } from '@oppsera/module-fnb';

// GET /api/v1/fnb/course-rules/pos — batch-resolved course rules for all F&B items
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? '';

    const rulesMap = await getCourseRulesForPos({
      tenantId: ctx.tenantId,
      locationId,
    });
    return NextResponse.json({ data: rulesMap });
  },
  { entitlement: 'fnb', permission: 'fnb.view' },
);
