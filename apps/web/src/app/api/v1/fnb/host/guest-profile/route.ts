import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { z } from 'zod';
import { getGuestProfile } from '@oppsera/module-fnb';

const querySchema = z
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

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const input = {
      locationId: ctx.locationId || url.searchParams.get('locationId') || '',
      customerId: url.searchParams.get('customerId') ?? undefined,
      guestPhone: url.searchParams.get('guestPhone') ?? undefined,
      guestEmail: url.searchParams.get('guestEmail') ?? undefined,
    };

    const parsed = querySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const profile = await getGuestProfile({
      tenantId: ctx.tenantId,
      locationId: parsed.data.locationId,
      customerId: parsed.data.customerId,
      guestPhone: parsed.data.guestPhone,
      guestEmail: parsed.data.guestEmail,
    });

    if (!profile) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Guest profile not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: profile });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.view' },
);
