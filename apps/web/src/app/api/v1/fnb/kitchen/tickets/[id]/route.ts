import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { getKitchenTicketDetail, updateTicketStatus, updateTicketStatusSchema } from '@oppsera/module-fnb';

// GET /api/v1/fnb/kitchen/tickets/[id] — get ticket detail
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const ticketId = parts[parts.length - 1]!;

    const detail = await getKitchenTicketDetail({
      tenantId: ctx.tenantId,
      ticketId,
    });
    return NextResponse.json({ data: detail });
  },
  { entitlement: 'kds', permission: 'kds.view' },
);

// PATCH /api/v1/fnb/kitchen/tickets/[id] — update ticket status
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const ticketId = parts[parts.length - 1]!;
    let body = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = updateTicketStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const ticket = await updateTicketStatus(ctx, ticketId, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: ticket });
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true },
);
