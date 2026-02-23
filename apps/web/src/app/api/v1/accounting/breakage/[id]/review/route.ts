import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { reviewBreakage, reviewBreakageSchema } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  // /api/v1/accounting/breakage/{id}/review
  return parts[parts.length - 2]!;
}

// POST /api/v1/accounting/breakage/:id/review — approve or decline breakage
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = reviewBreakageSchema.safeParse({ ...body, reviewItemId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await reviewBreakage(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
