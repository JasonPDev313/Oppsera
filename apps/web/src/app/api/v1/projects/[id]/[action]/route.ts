import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError, AppError } from '@oppsera/shared';
import {
  closeProject,
  archiveProject,
  unarchiveProject,
  archiveProjectSchema,
} from '@oppsera/module-project-costing';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const action = parts[parts.length - 1]!;
    const id = parts[parts.length - 2]!;

    switch (action) {
      case 'close': {
        const result = await closeProject(ctx, id);
        return NextResponse.json({ data: result });
      }

      case 'archive': {
        const body = await request.json().catch(() => ({}));
        const parsed = archiveProjectSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await archiveProject(ctx, id, parsed.data);
        return NextResponse.json({ data: result });
      }

      case 'unarchive': {
        const result = await unarchiveProject(ctx, id);
        return NextResponse.json({ data: result });
      }

      default:
        throw new AppError('NOT_FOUND', `Unknown action: ${action}`, 404);
    }
  },
  { entitlement: 'accounting', permission: 'project_costing.manage', writeAccess: true },
);
