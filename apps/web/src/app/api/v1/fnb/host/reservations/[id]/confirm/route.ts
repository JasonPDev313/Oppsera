import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { confirmReservation, confirmReservationSchema } from '@oppsera/module-fnb';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const id = extractId(req);
    const body = await req.json();
    const parsed = confirmReservationSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Invalid input', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await confirmReservation(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.manage', writeAccess: true },
);
