import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { postSettlementGl, postSettlementGlSchema } from '@oppsera/module-payments';

function extractSettlementId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/payments/settlements/{id}/post-gl
  const idx = parts.indexOf('settlements');
  return parts[idx + 1]!;
}

/**
 * POST /api/v1/payments/settlements/:id/post-gl
 *
 * Post GL journal entry for a matched settlement.
 * DR Bank Account, CR Payment Clearing, with separate fee entries.
 *
 * Body: { bankAccountId: string }
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const settlementId = extractSettlementId(request);
    const body = await request.json();

    const parsed = postSettlementGlSchema.safeParse({
      settlementId,
      bankAccountId: body.bankAccountId,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await postSettlementGl(ctx, parsed.data);

    return NextResponse.json({ data: result });
  },
  { entitlement: 'payments', permission: 'accounting.bank_reconciliation.manage', writeAccess: true },
);
