import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { prepareDepositSlip } from '@oppsera/module-accounting';
import { ValidationError } from '@oppsera/shared';
import { prepareDepositSlipSchema } from '@oppsera/core/drawer-sessions';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // URL: /api/v1/accounting/deposits/[id]/prepare — id is second-to-last
  return parts[parts.length - 2]!;
}

// POST /api/v1/accounting/deposits/[id]/prepare — Prepare deposit slip with denomination breakdown
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = prepareDepositSlipSchema.safeParse({
      ...body,
      depositSlipId: id,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await prepareDepositSlip(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
