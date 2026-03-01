import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  listWaitlist,
  addToWaitlist,
  addToWaitlistSchema,
} from '@oppsera/module-spa';

// GET /api/v1/spa/waitlist — list waitlist entries with cursor pagination
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { searchParams } = new URL(request.url);

    const statusParam = searchParams.get('status') ?? undefined;
    const customerId = searchParams.get('customerId') ?? undefined;
    const serviceId = searchParams.get('serviceId') ?? undefined;
    const providerId = searchParams.get('providerId') ?? undefined;
    const cursor = searchParams.get('cursor') ?? undefined;
    const limitParam = searchParams.get('limit');

    const status = statusParam
      ? statusParam.split(',').map((s) => s.trim()).filter(Boolean).at(0)
      : undefined;

    const result = await listWaitlist({
      tenantId: ctx.tenantId,
      status,
      customerId,
      serviceId,
      providerId,
      cursor,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });

    return NextResponse.json({
      data: result.items,
      meta: { cursor: result.cursor, hasMore: result.hasMore },
    });
  },
  { entitlement: 'spa', permission: 'spa.waitlist.view' },
);

// POST /api/v1/spa/waitlist — add a customer to the waitlist
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = addToWaitlistSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await addToWaitlist(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  {
    entitlement: 'spa',
    permission: 'spa.waitlist.manage',
    writeAccess: true,
  },
);
