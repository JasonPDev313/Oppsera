import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { runMonthlyDepreciation } from '@oppsera/module-accounting';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const { periodDate } = body;

    if (!periodDate) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'periodDate is required' } },
        { status: 400 },
      );
    }

    try {
      const result = await runMonthlyDepreciation(ctx, { periodDate });
      return NextResponse.json({ data: result });
    } catch (err) {
      console.error('[fixed-assets/depreciate-all] Error:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      const name = (err as { constructor?: { name?: string } })?.constructor?.name ?? '';
      const code = (err as { code?: string })?.code;
      if (name === 'PeriodLockedError' || code === 'PERIOD_LOCKED') {
        return NextResponse.json(
          { error: { code: 'PERIOD_LOCKED', message } },
          { status: 409 },
        );
      }
      const status = (err as { statusCode?: number })?.statusCode ?? 500;
      return NextResponse.json(
        { error: { code: 'DEPRECIATION_FAILED', message } },
        { status },
      );
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
