import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { executeDueRecurringEntries } from '@oppsera/module-accounting';

// POST /api/v1/accounting/recurring/execute-due — run all due templates
export const POST = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const result = await executeDueRecurringEntries(ctx);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
