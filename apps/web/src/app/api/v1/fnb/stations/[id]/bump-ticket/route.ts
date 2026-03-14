import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { bumpTicket, bumpTicketSchema } from '@oppsera/module-fnb';

// POST /api/v1/fnb/stations/[id]/bump-ticket — bump entire ticket from prep station
// Passes the station [id] so bumpTicket knows this is a prep-station bump (→ 'ready')
// vs. an expo bump (→ 'served').
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    // Extract station ID from URL: /api/v1/fnb/stations/{stationId}/bump-ticket
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const bumpIdx = segments.indexOf('bump-ticket');
    const stationId = bumpIdx > 0 ? segments[bumpIdx - 1] : undefined;

    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* empty body → validation will reject */ }
    const parsed = bumpTicketSchema.safeParse({ ...body, stationId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const ticket = await bumpTicket(ctx, parsed.data);
    broadcastFnb(ctx, 'kds').catch(() => {});
    return NextResponse.json({ data: ticket });
  },
  { entitlement: 'kds', permission: 'kds.bump', writeAccess: true },
);
