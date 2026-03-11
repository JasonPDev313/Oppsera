import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { reprioritizeTicket, reprioritizeTicketSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/tickets/[id]/reprioritize — change ticket priority level
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const reprioritizeIdx = segments.indexOf('reprioritize');
    const ticketId = reprioritizeIdx > 0 ? segments[reprioritizeIdx - 1] : undefined;

    const body = await request.json();
    const parsed = reprioritizeTicketSchema.safeParse({ ...body, ticketId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const ticket = await reprioritizeTicket(ctx, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: ticket });
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true },
);
