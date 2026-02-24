import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listSmartTagRules,
  createSmartTagRule,
  createSmartTagRuleSchema,
} from '@oppsera/module-customers';

// GET /api/v1/customers/smart-tag-rules
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);
    const result = await listSmartTagRules({
      tenantId: ctx.tenantId,
      isActive: searchParams.has('isActive') ? searchParams.get('isActive') === 'true' : undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: searchParams.has('limit') ? Number(searchParams.get('limit')) : undefined,
    });
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'customers', permission: 'customers.smart_tags.view' },
);

// POST /api/v1/customers/smart-tag-rules
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createSmartTagRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const rule = await createSmartTagRule(ctx, parsed.data);
    return NextResponse.json({ data: rule }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.smart_tags.manage', writeAccess: true },
);
