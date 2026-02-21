import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { saveTaxGroupDefaults, saveTaxGroupDefaultsSchema } from '@oppsera/module-accounting';

function extractTaxGroupId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// PUT /api/v1/accounting/mappings/tax-groups/:taxGroupId — save defaults
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const taxGroupId = extractTaxGroupId(request);
    const body = await request.json();
    const parsed = saveTaxGroupDefaultsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const defaults = await saveTaxGroupDefaults(ctx, taxGroupId, parsed.data);
    return NextResponse.json({ data: defaults });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
