import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateBillingItem,
  updateBillingItemSchema,
} from '@oppsera/module-membership';

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = request.url.split('/billing-items/');
    const itemId = segments[1]?.split('/')[0]?.split('?')[0];
    if (!itemId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Billing item ID is required' } },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = updateBillingItemSchema.safeParse({ ...body, billingItemId: itemId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateBillingItem(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'club_membership', permission: 'club_membership.manage' , writeAccess: true },
);
