import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listStatementLayouts, saveStatementLayout, saveStatementLayoutSchema } from '@oppsera/module-accounting';

// GET /api/v1/accounting/statement-layouts — list statement layouts
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const layouts = await listStatementLayouts({
      tenantId: ctx.tenantId,
      statementType: url.searchParams.get('statementType') ?? undefined,
    });

    return NextResponse.json({ data: layouts });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// POST /api/v1/accounting/statement-layouts — save (create/update) statement layout
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const input = saveStatementLayoutSchema.parse(body);
    const layout = await saveStatementLayout(ctx, input);

    return NextResponse.json({ data: layout }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
