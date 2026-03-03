import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { refreshServerLoadSnapshot, refreshServerLoadSchema } from '@oppsera/module-fnb';

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const parsed = refreshServerLoadSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const businessDate =
      parsed.data.businessDate ?? new Date().toISOString().slice(0, 10);

    await refreshServerLoadSnapshot(ctx, parsed.data.locationId, businessDate);

    return NextResponse.json({ data: { ok: true, businessDate } }, { status: 200 });
  },
  {
    entitlement: 'pos_fnb',
    permission: 'pos_fnb.host.manage',
    writeAccess: true,
  },
);
