import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  createTaxGroup,
  listTaxGroups,
} from '@oppsera/module-catalog';
import { createTaxGroupSchema } from '@oppsera/module-catalog/validation-taxes';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId');

    if (!locationId) {
      throw new ValidationError('locationId query parameter is required');
    }

    const groups = await listTaxGroups(ctx.tenantId, locationId);
    return NextResponse.json({ data: groups });
  },
  { entitlement: 'catalog', permission: 'catalog.view', cache: 'private, max-age=300, stale-while-revalidate=600' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createTaxGroupSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const group = await createTaxGroup(ctx, parsed.data);
    return NextResponse.json({ data: group }, { status: 201 });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' , writeAccess: true },
);
