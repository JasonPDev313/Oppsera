import { NextResponse, type NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listTerminals,
  createTerminal,
  createTerminalSchema,
} from '@oppsera/core/profit-centers';

function extractProfitCenterId(request: NextRequest): string {
  // URL: /api/v1/profit-centers/{id}/terminals
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const terminalsIdx = parts.indexOf('terminals');
  return parts[terminalsIdx - 1]!;
}

// GET /api/v1/profit-centers/:id/terminals
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const profitCenterId = extractProfitCenterId(request);

    const result = await listTerminals({
      tenantId: ctx.tenantId,
      profitCenterId,
    });

    return NextResponse.json({ data: result.items });
  },
  { entitlement: 'platform_core', permission: 'settings.view' },
);

// POST /api/v1/profit-centers/:id/terminals
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const profitCenterId = extractProfitCenterId(request);
    const body = await request.json();
    const parsed = createTerminalSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createTerminal(ctx, profitCenterId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'platform_core', permission: 'settings.update' , writeAccess: true },
);
