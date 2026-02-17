import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateTaxGroup } from '@oppsera/module-catalog';
import { updateTaxGroupSchema } from '@oppsera/module-catalog/validation-taxes';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const taxGroupId = extractId(request);
    const body = await request.json();
    const parsed = updateTaxGroupSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const group = await updateTaxGroup(ctx, taxGroupId, parsed.data);
    return NextResponse.json({ data: group });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
