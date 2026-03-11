import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import {
  listCourseRules,
  upsertCourseRule, upsertCourseRuleSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/course-rules?scopeType=department
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const scopeType = url.searchParams.get('scopeType') ?? undefined;
    const locationId = ctx.locationId ?? url.searchParams.get('locationId') ?? '';

    const rules = await listCourseRules({
      tenantId: ctx.tenantId,
      locationId,
      scopeType,
    });
    return NextResponse.json({ data: rules });
  },
  { entitlement: 'fnb', permission: 'fnb.view' },
);

// POST /api/v1/fnb/course-rules — upsert a course rule
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json().catch(() => ({}));
    const parsed = upsertCourseRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await upsertCourseRule(ctx, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'fnb', permission: 'fnb.manage', writeAccess: true },
);
