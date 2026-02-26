import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { seatReservation, seatReservationSchema } from '@oppsera/module-fnb';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const id = extractId(req);
    const body = await req.json();
    // tableIds optional — if not provided, returns suggestions
    if (body.tableIds && body.tableIds.length > 0) {
      const parsed = seatReservationSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
      }
      const result = await seatReservation(ctx, id, parsed.data);
      return NextResponse.json(result);
    }
    // No tableIds — return suggestions
    const result = await seatReservation(ctx, id, {});
    return NextResponse.json(result);
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.manage', writeAccess: true },
);
