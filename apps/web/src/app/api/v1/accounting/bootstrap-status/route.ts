import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant } from '@oppsera/db';
import { isAccountingBootstrapped } from '@oppsera/module-accounting';

// GET /api/v1/accounting/bootstrap-status — lightweight check using raw SQL
// Unlike GET /api/v1/accounting/settings (which does SELECT * via Drizzle ORM),
// this endpoint only checks row existence and survives schema mismatches from
// un-applied migrations. This is the endpoint the frontend should use to decide
// whether to show the bootstrap wizard.
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    try {
      const status = await withTenant(ctx.tenantId, async (tx) => {
        return isAccountingBootstrapped(tx, ctx.tenantId);
      });

      return NextResponse.json({ data: status });
    } catch (err) {
      // Even if DB is completely unreachable, return a structured error
      // rather than letting withMiddleware's generic handler mask the cause.
      const message = err instanceof Error ? err.message : 'Bootstrap status check failed';
      console.error('[accounting/bootstrap-status] Error:', message);
      return NextResponse.json(
        { error: { code: 'BOOTSTRAP_STATUS_ERROR', message } },
        { status: 500 },
      );
    }
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
