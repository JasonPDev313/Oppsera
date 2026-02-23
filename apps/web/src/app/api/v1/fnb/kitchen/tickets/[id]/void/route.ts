import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { voidTicket, voidTicketSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/kitchen/tickets/[id]/void — void a kitchen ticket
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const ticketId = parts[parts.length - 2]!;
    const body = await request.json();
    const parsed = voidTicketSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const ticket = await voidTicket(ctx, ticketId, parsed.data);
    return NextResponse.json({ data: ticket });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.manage' , writeAccess: true },
);
