import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { reconcileRetailClose, reconcileRetailCloseSchema } from '@oppsera/core/retail-close';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/retail-close/[id]/reconcile — Reconcile with cash count
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = reconcileRetailCloseSchema.safeParse({ ...body, batchId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const batch = await reconcileRetailClose(ctx, parsed.data);
    return NextResponse.json({ data: batch });
  },
  { entitlement: 'orders', permission: 'shift.manage' , writeAccess: true },
);
