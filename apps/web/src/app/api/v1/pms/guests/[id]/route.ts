import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  getGuest,
  updateGuest,
  updateGuestSchema,
} from '@oppsera/module-pms';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/pms/guests/:id — get guest profile with stay history
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const url = new URL(request.url);
    const historyLimitParam = url.searchParams.get('historyLimit');
    const historyLimit = historyLimitParam ? Math.min(parseInt(historyLimitParam, 10), 100) : undefined;

    const result = await getGuest(ctx.tenantId, id, historyLimit);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: 'pms.guests.view' },
);

// PATCH /api/v1/pms/guests/:id — update guest
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateGuestSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateGuest(ctx, id, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pms', permission: 'pms.guests.manage' , writeAccess: true },
);
