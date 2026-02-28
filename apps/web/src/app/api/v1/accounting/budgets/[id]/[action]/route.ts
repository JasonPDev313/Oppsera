import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { approveBudget, lockBudget, upsertBudgetLines } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const action = extractAction(request);

    switch (action) {
      case 'approve': {
        const result = await approveBudget(ctx, id);
        return NextResponse.json({ data: result });
      }

      case 'lock': {
        const result = await lockBudget(ctx, id);
        return NextResponse.json({ data: result });
      }

      case 'lines': {
        const body = await request.json();
        const { lines } = body;

        if (!Array.isArray(lines) || lines.length === 0) {
          return NextResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'lines array is required' } },
            { status: 400 },
          );
        }

        const result = await upsertBudgetLines(ctx, id, lines);
        return NextResponse.json({ data: result });
      }

      default:
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
          { status: 404 },
        );
    }
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
