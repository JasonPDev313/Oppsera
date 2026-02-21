import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { saveSubDepartmentDefaults, saveSubDepartmentDefaultsSchema } from '@oppsera/module-accounting';

function extractSubDepartmentId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// PUT /api/v1/accounting/mappings/sub-departments/:subDepartmentId — save defaults
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const subDepartmentId = extractSubDepartmentId(request);
    const body = await request.json();
    const parsed = saveSubDepartmentDefaultsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const defaults = await saveSubDepartmentDefaults(ctx, subDepartmentId, parsed.data);
    return NextResponse.json({ data: defaults });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
