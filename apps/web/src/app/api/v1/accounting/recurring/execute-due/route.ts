import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { executeDueRecurringEntries } from '@oppsera/module-accounting';

// POST /api/v1/accounting/recurring/execute-due — run all due templates
export const POST = withMiddleware(
  async (_request: NextRequest, ctx) => {
    try {
      const result = await executeDueRecurringEntries(ctx);
      return NextResponse.json({ data: result });
    } catch (err) {
      console.error('[recurring/execute-due] Error:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      const status = (err as { statusCode?: number })?.statusCode ?? 500;
      return NextResponse.json(
        { error: { code: 'EXECUTE_RECURRING_FAILED', message } },
        { status },
      );
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
