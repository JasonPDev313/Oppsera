import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { tagItemAllergen, tagItemAllergenSchema, removeItemAllergen, removeItemAllergenSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/menu/allergens/items — tag item with allergen
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = tagItemAllergenSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await tagItemAllergen(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.menu.manage', writeAccess: true },
);

// DELETE /api/v1/fnb/menu/allergens/items — remove item allergen tag
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = removeItemAllergenSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await removeItemAllergen(ctx, parsed.data);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.menu.manage' , writeAccess: true },
);
