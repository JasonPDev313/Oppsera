import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { suggestCourseRules } from '@oppsera/module-fnb';

// GET /api/v1/fnb/course-rules/suggestions — auto-suggest course rules from catalog names
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? '';

    const suggestions = await suggestCourseRules({
      tenantId: ctx.tenantId,
      locationId,
    });
    return NextResponse.json({ data: suggestions });
  },
  { entitlement: 'fnb', permission: 'fnb.view' },
);
