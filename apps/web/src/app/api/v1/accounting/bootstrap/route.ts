import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { bootstrapTenantAccounting } from '@oppsera/module-accounting';

// POST /api/v1/accounting/bootstrap — bootstrap chart of accounts from template
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* empty body uses default template */ }
    try {
      const result = await bootstrapTenantAccounting(ctx, {
        templateKey: body.templateKey as string | undefined,
        stateName: body.stateName as string | undefined,
      });
      return NextResponse.json({ data: result }, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bootstrap failed';
      // Surface DB column/constraint errors clearly — usually means migrations are pending
      const isDbError = message.includes('column') || message.includes('relation') || message.includes('constraint');
      console.error('[accounting/bootstrap] Error:', message);
      return NextResponse.json(
        { error: { code: 'BOOTSTRAP_ERROR', message: isDbError ? `Database schema mismatch — run pending migrations (pnpm db:migrate). Detail: ${message}` : message } },
        { status: isDbError ? 500 : 400 },
      );
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
