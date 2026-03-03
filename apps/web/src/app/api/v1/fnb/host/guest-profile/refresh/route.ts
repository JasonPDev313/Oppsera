import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { z } from 'zod';
import { refreshGuestProfile } from '@oppsera/module-fnb';

const bodySchema = z
  .object({
    locationId: z.string().min(1),
    customerId: z.string().min(1).optional(),
    guestPhone: z.string().min(1).optional(),
    guestEmail: z.string().email().optional(),
  })
  .refine(
    (v) => v.customerId || v.guestPhone || v.guestEmail,
    { message: 'At least one of customerId, guestPhone, or guestEmail is required' },
  );

export const POST = withMiddleware(
  async (req: NextRequest, ctx) => {
    const body = await req.json();
    const input = {
      locationId: body.locationId || ctx.locationId || '',
      customerId: body.customerId ?? undefined,
      guestPhone: body.guestPhone ?? undefined,
      guestEmail: body.guestEmail ?? undefined,
    };

    const parsed = bodySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const profile = await refreshGuestProfile(ctx, {
      locationId: parsed.data.locationId,
      customerId: parsed.data.customerId,
      guestPhone: parsed.data.guestPhone,
      guestEmail: parsed.data.guestEmail,
    });

    if (!profile) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'No guest data found to build profile from' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: profile });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.manage', writeAccess: true },
);
