import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { listAllergens, createAllergen, createAllergenSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/menu/allergens — list allergens
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await listAllergens({ tenantId: ctx.tenantId });
    return NextResponse.json({ data: items });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.menu.view' },
);

// POST /api/v1/fnb/menu/allergens — create allergen
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createAllergenSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const allergen = await createAllergen(ctx, parsed.data);
    return NextResponse.json({ data: allergen }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.menu.manage' },
);
