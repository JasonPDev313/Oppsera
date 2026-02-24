import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateColumnMappings, updateColumnMappingsSchema } from '@oppsera/module-import';

function extractJobId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // .../jobs/[id]/mappings → id is parts[-2]
  return parts[parts.length - 2]!;
}

// PATCH /api/v1/import/jobs/:id/mappings — update column mappings
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const importJobId = extractJobId(request);
    const body = await request.json();
    const parsed = updateColumnMappingsSchema.safeParse({
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

    await updateColumnMappings(ctx, parsed.data);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'legacy_import', permission: 'import.manage', writeAccess: true },
);
