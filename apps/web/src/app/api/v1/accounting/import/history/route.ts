import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listCoaImportLogs } from '@oppsera/module-accounting';

// GET /api/v1/accounting/import/history — list past COA imports
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const logs = await listCoaImportLogs({ tenantId: ctx.tenantId });
    return NextResponse.json({ data: logs });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
