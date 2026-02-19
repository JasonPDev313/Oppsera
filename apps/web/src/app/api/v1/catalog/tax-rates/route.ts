import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createTaxRate,
  listTaxRates,
} from '@oppsera/module-catalog';
import { createTaxRateSchema } from '@oppsera/module-catalog/validation-taxes';

export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const rates = await listTaxRates(ctx.tenantId);
    return NextResponse.json({ data: rates });
  },
  { entitlement: 'catalog', permission: 'catalog.view', cache: 'private, max-age=300, stale-while-revalidate=600' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createTaxRateSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const rate = await createTaxRate(ctx, parsed.data);
    return NextResponse.json({ data: rate }, { status: 201 });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
