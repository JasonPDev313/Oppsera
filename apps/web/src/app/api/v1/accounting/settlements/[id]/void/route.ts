import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { voidSettlement, voidSettlementSchema } from '@oppsera/module-accounting';

function extractSettlementId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const settlementId = extractSettlementId(request);
    const body = await request.json();
    const parsed = voidSettlementSchema.safeParse({
      ...body,
      settlementId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await voidSettlement(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
