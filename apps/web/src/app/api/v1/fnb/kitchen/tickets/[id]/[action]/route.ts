import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  voidTicket,
  voidTicketSchema,
  createDeltaChit,
  createDeltaChitSchema,
  updateTicketStatus,
  updateTicketStatusSchema,
} from '@oppsera/module-fnb';

const ACTIONS: Record<string, true> = { void: true, delta: true, fire: true, recall: true };

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/fnb/kitchen/tickets/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const body = await request.json();

    switch (action) {
      case 'void': {
        const ticketId = extractId(request);
        const parsed = voidTicketSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const ticket = await voidTicket(ctx, ticketId, parsed.data);
        return NextResponse.json({ data: ticket });
      }
      case 'delta': {
        const parsed = createDeltaChitSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const chit = await createDeltaChit(ctx, parsed.data);
        return NextResponse.json({ data: chit }, { status: 201 });
      }
      case 'fire':
      case 'recall': {
        const ticketId = extractId(request);
        const parsed = updateTicketStatusSchema.safeParse({
          ...body,
          status: 'in_progress',
          clientRequestId: body.clientRequestId ?? `${action}-${ticketId}-${Date.now()}`,
        });
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const updated = await updateTicketStatus(ctx, ticketId, parsed.data);
        return NextResponse.json({ data: updated });
      }
    }

    // Unreachable — all actions handled above, unknown actions caught by guard
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Unknown action` } },
      { status: 404 },
    );
  },
  { entitlement: 'kds', permission: 'kds.manage', writeAccess: true },
);
