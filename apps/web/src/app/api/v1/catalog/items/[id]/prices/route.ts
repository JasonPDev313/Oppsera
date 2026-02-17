import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { setLocationPrice } from '@oppsera/module-catalog';
import { z } from 'zod';

function extractItemId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id/prices
  return parts[parts.length - 2]!;
}

const setPriceBody = z.object({
  locationId: z.string().min(1),
  price: z.number().positive().multipleOf(0.01),
});

// PUT /api/v1/catalog/items/:id/prices — set location price override
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const catalogItemId = extractItemId(request);
    const body = await request.json();
    const parsed = setPriceBody.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await setLocationPrice(ctx, {
      catalogItemId,
      locationId: parsed.data.locationId,
      price: parsed.data.price,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' },
);
