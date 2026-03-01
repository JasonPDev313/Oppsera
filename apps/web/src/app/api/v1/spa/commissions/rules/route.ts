import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listCommissionRules,
  createCommissionRule,
  createCommissionRuleSchema,
} from '@oppsera/module-spa';

// GET /api/v1/spa/commissions/rules — list commission rules with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const providerId = searchParams.get('providerId') ?? undefined;
    const isActiveParam = searchParams.get('isActive');
    const appliesTo = searchParams.get('appliesTo') ?? undefined;
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');

    const isActive =
      isActiveParam === 'true'
        ? true
        : isActiveParam === 'false'
          ? false
          : undefined;

    const result = await listCommissionRules({
      tenantId: ctx.tenantId,
      providerId,
      isActive,
      appliesTo,
      cursor,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'spa', permission: 'spa.commissions.view' },
);

// POST /api/v1/spa/commissions/rules — create a new commission rule
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createCommissionRuleSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const rule = await createCommissionRule(ctx, parsed.data);
    return NextResponse.json({ data: rule }, { status: 201 });
  },
  { entitlement: 'spa', permission: 'spa.commissions.manage', writeAccess: true },
);
