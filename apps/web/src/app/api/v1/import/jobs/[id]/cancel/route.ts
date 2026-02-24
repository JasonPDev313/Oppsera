import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { cancelImport, cancelImportSchema } from '@oppsera/module-import';

function extractJobId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/import/jobs/:id/cancel — cancel in-progress import
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const importJobId = extractJobId(request);
    const parsed = cancelImportSchema.safeParse({
      tenantId: ctx.tenantId,
      importJobId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await cancelImport(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'legacy_import', permission: 'import.manage', writeAccess: true },
);
