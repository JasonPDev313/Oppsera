import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { addTabItems, addTabItemsSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tabs/:id/items — add items to tab
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = new URL(request.url).pathname.split('/');
    // URL: /api/v1/fnb/tabs/:id/items → id is at index -2
    const tabId = parts[parts.length - 2]!;

    const body = await request.json();
    const parsed = addTabItemsSchema.safeParse({ ...body, tabId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await addTabItems(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage' },
);
