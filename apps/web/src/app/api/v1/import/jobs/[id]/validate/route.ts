import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { validateImport, validateImportSchema } from '@oppsera/module-import';

function extractJobId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/import/jobs/:id/validate — run validation + reconciliation
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const importJobId = extractJobId(request);
    const body = await request.json();
    const parsed = validateImportSchema.safeParse({
      ...body,
      tenantId: ctx.tenantId,
      importJobId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const csvContent = typeof body.csvContent === 'string' ? body.csvContent : '';
    const result = await validateImport(ctx, parsed.data, csvContent);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'legacy_import', permission: 'import.manage', writeAccess: true },
);
