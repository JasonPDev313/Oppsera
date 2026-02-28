import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { parseLimit } from '@/lib/api-params';
import {
  listTasks,
  createTask,
  createTaskSchema,
} from '@oppsera/module-project-costing';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    // /api/v1/projects/[id]/tasks → id is parts[parts.length - 2]
    const projectId = parts[parts.length - 2]!;
    const { searchParams } = new URL(request.url);
    const result = await listTasks({
      tenantId: ctx.tenantId,
      projectId,
      status: searchParams.get('status') ?? undefined,
      cursor: searchParams.get('cursor') ?? undefined,
      limit: parseLimit(searchParams.get('limit')),
    });
    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'project_costing', permission: 'project_costing.view' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const projectId = parts[parts.length - 2]!;
    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await createTask(ctx, projectId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'project_costing', permission: 'project_costing.manage', writeAccess: true },
);
