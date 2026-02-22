import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getBillingCyclePreview } from '@oppsera/module-membership';

function extractRunId(url: string): string {
  const parts = url.split('/billing-cycles/')[1]?.split('/')[0]?.split('?')[0];
  return parts ?? '';
}

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const runId = extractRunId(request.url);
    if (!runId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Run ID is required' } },
        { status: 400 },
      );
    }

    const preview = await getBillingCyclePreview({
      tenantId: ctx.tenantId,
      runId,
    });

    return NextResponse.json({ data: preview });
  },
  { entitlement: 'club_membership', permission: 'club_membership.billing' },
);
