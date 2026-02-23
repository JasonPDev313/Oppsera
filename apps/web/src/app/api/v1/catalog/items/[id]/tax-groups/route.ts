import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  assignItemTaxGroups,
  getItemTaxGroupsAtLocation,
} from '@oppsera/module-catalog';
import { assignItemTaxGroupsSchema } from '@oppsera/module-catalog/validation-taxes';

function extractItemId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id/tax-groups
  return parts[parts.length - 2]!;
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const catalogItemId = extractItemId(request);
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId');

    if (!locationId) {
      throw new ValidationError('locationId query parameter is required');
    }

    const assignments = await getItemTaxGroupsAtLocation(
      ctx.tenantId,
      locationId,
      catalogItemId,
    );
    return NextResponse.json({ data: assignments });
  },
  { entitlement: 'catalog', permission: 'catalog.view' },
);

export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const catalogItemId = extractItemId(request);
    const url = new URL(request.url);
    const locationId = url.searchParams.get('locationId');
    const body = await request.json();

    const parsed = assignItemTaxGroupsSchema.safeParse({
      ...body,
      catalogItemId,
      locationId: locationId ?? body.locationId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await assignItemTaxGroups(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' , writeAccess: true },
);
