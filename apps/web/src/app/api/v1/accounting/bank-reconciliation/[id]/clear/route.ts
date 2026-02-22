import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  clearReconciliationItems,
  clearReconciliationItemsSchema,
} from '@oppsera/module-accounting';

function extractReconciliationId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const reconciliationId = extractReconciliationId(request);
    const body = await request.json();
    const parsed = clearReconciliationItemsSchema.safeParse({ ...body, reconciliationId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await clearReconciliationItems(ctx, parsed.data);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
