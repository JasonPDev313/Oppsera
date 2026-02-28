import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { closeAccountingPeriod } from '@oppsera/module-accounting';

// POST /api/v1/accounting/close-periods/[period]/close — close and lock period
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = new URL(request.url).pathname.split('/');
    const period = decodeURIComponent(segments[segments.indexOf('close-periods') + 1]!);

    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* empty body is valid — notes are optional */ }
    const result = await closeAccountingPeriod(ctx, {
      postingPeriod: period,
      notes: body.notes as string | undefined,
    });

    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true, replayGuard: true, stepUp: 'financial_critical' },
);
