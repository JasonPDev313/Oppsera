import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { recallItem, recallItemSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/stations/[id]/recall — recall a bumped item back to cooking
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = recallItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const item = await recallItem(ctx, parsed.data);
    return NextResponse.json({ data: item });
  },
  { entitlement: 'kds', permission: 'kds.recall', writeAccess: true },
);
