import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { closeTask } from '@oppsera/module-project-costing';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    // /api/v1/projects/[id]/tasks/[taskId]/close → taskId is parts[parts.length - 2]
    const taskId = parts[parts.length - 2]!;
    const result = await closeTask(ctx, taskId);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'project_costing.manage', writeAccess: true },
);
