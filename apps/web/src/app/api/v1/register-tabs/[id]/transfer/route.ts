import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  transferRegisterTab,
  transferRegisterTabSchema,
} from '@oppsera/core/register-tabs';

function extractTabId(request: NextRequest): string {
  const segments = new URL(request.url).pathname.split('/');
  // URL: /api/v1/register-tabs/[id]/transfer  → id is at index -2
  return segments[segments.length - 2]!;
}

// POST /api/v1/register-tabs/:id/transfer — transfer a tab's order to another terminal
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const sourceTabId = extractTabId(request);
    const body = await request.json();
    const parsed = transferRegisterTabSchema.safeParse({ ...body, sourceTabId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await transferRegisterTab(ctx, parsed.data);

    return NextResponse.json({
      data: {
        orderId: result.orderId,
        sourceTab: result.sourceTab,
        targetTab: result.targetTab,
      },
    });
  },
  { entitlement: 'orders', permission: 'orders.create', writeAccess: true },
);
