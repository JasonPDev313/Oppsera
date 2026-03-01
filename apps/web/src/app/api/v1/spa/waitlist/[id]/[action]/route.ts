import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  removeFromWaitlist,
  offerWaitlistSlot,
  acceptWaitlistOffer,
  declineWaitlistOffer,
} from '@oppsera/module-spa';

const ACTIONS: Record<string, true> = {
  remove: true,
  offer: true,
  accept: true,
  decline: true,
};

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/spa/waitlist/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const id = extractId(request);

    let body: Record<string, unknown> = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine for simple lifecycle transitions
    }

    switch (action) {
      case 'remove': {
        const result = await removeFromWaitlist(ctx, { id });
        return NextResponse.json({ data: result });
      }

      case 'offer': {
        const result = await offerWaitlistSlot(ctx, {
          id,
          appointmentId: body.appointmentId as string,
        });
        return NextResponse.json({ data: result });
      }

      case 'accept': {
        const result = await acceptWaitlistOffer(ctx, { id });
        return NextResponse.json({ data: result });
      }

      case 'decline': {
        const result = await declineWaitlistOffer(ctx, { id });
        return NextResponse.json({ data: result });
      }
    }

    // Unreachable — all actions handled above, unknown actions caught by guard
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Unknown action' } },
      { status: 404 },
    );
  },
  { entitlement: 'spa', permission: 'spa.waitlist.manage', writeAccess: true },
);
