import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { seatTable, seatTableSchema, clearTable } from '@oppsera/module-fnb';

const ACTIONS: Record<string, true> = { seat: true, clear: true };

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/fnb/tables/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const tableId = extractId(request);

    switch (action) {
      case 'seat': {
        const body = await request.json();
        const parsed = seatTableSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const result = await seatTable(ctx, tableId, parsed.data);
        return NextResponse.json({ data: result }, { status: 201 });
      }
      case 'clear': {
        let body: Record<string, unknown> = {};
        try { body = await request.json(); } catch { /* empty body is valid */ }
        const result = await clearTable(ctx, tableId, {
          clientRequestId: body.clientRequestId as string | undefined,
          markAvailable: body.markAvailable as boolean | undefined,
          expectedVersion: body.expectedVersion as number | undefined,
        });
        return NextResponse.json({ data: result });
      }
    }
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.floor_plan.manage', writeAccess: true },
);
