import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listOpenPreauths,
  createPreauth,
  listOpenPreauthsSchema,
  createPreauthSchema,
} from '@oppsera/module-fnb';

// GET /api/v1/fnb/preauth — list open pre-auths
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = request.nextUrl;
    const parsed = listOpenPreauthsSchema.safeParse({
      tenantId: ctx.tenantId,
      locationId: url.searchParams.get('locationId') || undefined,
      status: url.searchParams.get('status') || undefined,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await listOpenPreauths(parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.view' },
);

// POST /api/v1/fnb/preauth — create pre-auth
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createPreauthSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createPreauth(ctx, ctx.locationId ?? '', parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage' , writeAccess: true },
);
