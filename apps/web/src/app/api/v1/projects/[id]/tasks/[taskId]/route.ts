import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateTask,
  updateTaskSchema,
} from '@oppsera/module-project-costing';

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    // /api/v1/projects/[id]/tasks/[taskId] → taskId is last
    const taskId = parts[parts.length - 1]!;
    const body = await request.json();
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateTask(ctx, taskId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'project_costing', permission: 'project_costing.manage', writeAccess: true },
);
