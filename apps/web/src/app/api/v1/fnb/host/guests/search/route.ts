import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { z } from 'zod';
import { searchGuestProfiles } from '@oppsera/module-fnb';

const querySchema = z.object({
  tenantId: z.string().min(1),
  locationId: z.string().min(1),
  search: z.string().min(1, 'Search query must not be empty'),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().min(1).max(100).optional()),
});

export const GET = withMiddleware(
  async (req: NextRequest, ctx) => {
    const url = new URL(req.url);
    const input = {
      tenantId: ctx.tenantId,
      locationId: ctx.locationId || url.searchParams.get('locationId') || '',
      search: url.searchParams.get('q') || '',
      limit: url.searchParams.get('limit') ?? undefined,
    };

    const parsed = querySchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        'Invalid input',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const data = await searchGuestProfiles(parsed.data);
    return NextResponse.json({ data });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.host.guests.read' },
);
