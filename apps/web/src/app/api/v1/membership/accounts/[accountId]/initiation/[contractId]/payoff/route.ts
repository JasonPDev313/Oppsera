import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { computePayoffQuoteCommand } from '@oppsera/module-membership';

function extractContractId(url: string): string {
  const parts = url.split('/initiation/')[1]?.split('/')[0]?.split('?')[0];
  return parts ?? '';
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const contractId = extractContractId(request.url);
    if (!contractId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Contract ID is required' } },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const payoffDate = url.searchParams.get('date') ?? undefined;

    const quote = await computePayoffQuoteCommand(ctx, {
      contractId,
      payoffDate,
    });

    return NextResponse.json({ data: quote });
  },
  { entitlement: 'club_membership', permission: 'club_membership.view' },
);
