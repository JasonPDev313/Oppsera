import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { parseLimit } from '@/lib/api-params';
import {
  listTagActions,
  createTagAction,
  createTagActionSchema,
  getTagActionExecutions,
} from '@oppsera/module-customers';

function extractTagId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // .../tags/:tagId/actions → tagId is at index -2
  const actionsIdx = parts.lastIndexOf('actions');
  return parts[actionsIdx - 1]!;
}

// GET /api/v1/customers/tags/:tagId/actions
// Also handles ?executions=true for execution history
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tagId = extractTagId(request);
    const { searchParams } = new URL(request.url);

    // If ?executions=true, return execution history instead
    if (searchParams.get('executions') === 'true') {
      const result = await getTagActionExecutions({
        tenantId: ctx.tenantId,
        tagId,
        customerId: searchParams.get('customerId') ?? undefined,
        status: (searchParams.get('status') as 'success' | 'failed' | 'skipped') ?? undefined,
        from: searchParams.get('from') ?? undefined,
        to: searchParams.get('to') ?? undefined,
        cursor: searchParams.get('cursor') ?? undefined,
        limit: parseLimit(searchParams.get('limit')),
      });
      return NextResponse.json({
        data: result.items,
        meta: { cursor: result.cursor, hasMore: result.hasMore },
      });
    }

    // Default: list tag actions
    const trigger = searchParams.get('trigger') as 'on_apply' | 'on_remove' | 'on_expire' | null;
    const items = await listTagActions({
      tenantId: ctx.tenantId,
      tagId,
      trigger: trigger ?? undefined,
    });
    return NextResponse.json({ data: items });
  },
  { entitlement: 'customers', permission: 'customers.tags.view' },
);

// POST /api/v1/customers/tags/:tagId/actions
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tagId = extractTagId(request);
    const body = await request.json();
    const parsed = createTagActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const action = await createTagAction(ctx.tenantId, tagId, parsed.data);
    return NextResponse.json({ data: action }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.tags.manage', writeAccess: true },
);
