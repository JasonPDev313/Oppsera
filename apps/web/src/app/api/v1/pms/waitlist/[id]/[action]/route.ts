import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import {
  removeFromWaitlist,
  offerWaitlistSlot,
  acceptWaitlistOffer,
  declineWaitlistOffer,
  PMS_PERMISSIONS,
} from '@oppsera/module-pms';

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segments = new URL(request.url).pathname.split('/').filter(Boolean);
    const id = segments[segments.indexOf('waitlist') + 1]!;
    const action = segments[segments.indexOf('waitlist') + 2]!;
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    switch (action) {
      case 'remove': {
        const result = await removeFromWaitlist(ctx, { id });
        return NextResponse.json({ data: result });
      }
      case 'offer': {
        const result = await offerWaitlistSlot(ctx, {
          id,
          reservationId: body.reservationId as string | undefined,
          rateCents: body.rateCents as number | undefined,
          expiryHours: body.expiryHours as number | undefined,
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
      default:
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
          { status: 404 },
        );
    }
  },
  { entitlement: 'pms', permission: PMS_PERMISSIONS.WAITLIST_MANAGE, writeAccess: true },
);
