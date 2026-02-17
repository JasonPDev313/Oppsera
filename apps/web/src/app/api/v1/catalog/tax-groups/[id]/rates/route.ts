import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { addTaxRateToGroup } from '@oppsera/module-catalog';
import { addTaxRateToGroupSchema } from '@oppsera/module-catalog/validation-taxes';

function extractGroupId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/tax-groups/:id/rates
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const taxGroupId = extractGroupId(request);
    const body = await request.json();
    const parsed = addTaxRateToGroupSchema.safeParse({ ...body, taxGroupId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await addTaxRateToGroup(ctx, parsed.data);
    return NextResponse.json({ data: { success: true } }, { status: 201 });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
