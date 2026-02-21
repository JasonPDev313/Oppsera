import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { updateTicketItemStatus, updateTicketItemStatusSchema } from '@oppsera/module-fnb';

// PATCH /api/v1/fnb/kitchen/tickets/[id]/items/[itemId] — update ticket item status
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const parts = request.nextUrl.pathname.split('/');
    const ticketItemId = parts[parts.length - 1]!;
    const body = await request.json();
    const parsed = updateTicketItemStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const item = await updateTicketItemStatus(ctx, ticketItemId, parsed.data);
    return NextResponse.json({ data: item });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.kds.manage' },
);
