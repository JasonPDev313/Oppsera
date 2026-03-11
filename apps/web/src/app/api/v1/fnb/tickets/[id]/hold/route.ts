import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { holdTicket, holdTicketSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tickets/[id]/hold — hold or unhold a kitchen ticket
// Body: { hold: true/false, clientRequestId? }
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const holdIdx = segments.indexOf('hold');
    const ticketId = holdIdx > 0 ? segments[holdIdx - 1] : undefined;

    const body = await request.json();
    const parsed = holdTicketSchema.safeParse({ ...body, ticketId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const ticket = await holdTicket(ctx, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: ticket });
  },
  { entitlement: 'kds', permission: 'kds.hold', writeAccess: true },
);
