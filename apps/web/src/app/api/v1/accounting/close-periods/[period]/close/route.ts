import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { closeAccountingPeriod } from '@oppsera/module-accounting';

// POST /api/v1/accounting/close-periods/[period]/close — close and lock period
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = new URL(request.url).pathname.split('/');
    const period = decodeURIComponent(segments[segments.indexOf('close-periods') + 1]!);

    const body = await request.json().catch(() => ({}));
    const result = await closeAccountingPeriod(ctx, {
      postingPeriod: period,
      notes: body.notes,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
