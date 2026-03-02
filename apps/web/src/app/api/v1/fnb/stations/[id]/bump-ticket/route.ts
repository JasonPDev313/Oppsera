import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { bumpTicket, bumpTicketSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/stations/[id]/bump-ticket — bump entire ticket
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = bumpTicketSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const ticket = await bumpTicket(ctx, parsed.data);
    return NextResponse.json({ data: ticket });
  },
  { entitlement: 'kds', permission: 'kds.bump', writeAccess: true },
);
