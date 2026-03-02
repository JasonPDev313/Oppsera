import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getProject,
  updateProject,
  updateProjectSchema,
} from '@oppsera/module-project-costing';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1]!;
    const result = await getProject(ctx.tenantId, id);
    if (!result) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'project_costing.view' },
);

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const id = parts[parts.length - 1]!;
    const body = await request.json();
    const parsed = updateProjectSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await updateProject(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'project_costing.manage', writeAccess: true },
);
