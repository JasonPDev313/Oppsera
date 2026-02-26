import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError, ValidationError } from '@oppsera/shared';
import {
  calculatePeriodicCogs,
  listPeriodicCogs,
  postPeriodicCogs,
  calculatePeriodicCogsSchema,
  listPeriodicCogsSchema,
  postPeriodicCogsSchema,
} from '@oppsera/module-accounting';
import { parseLimit } from '@/lib/api-params';

export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const parsed = listPeriodicCogsSchema.safeParse({
      locationId: url.searchParams.get('locationId') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: parseLimit(url.searchParams.get('limit')),
    });

    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
    }
    const result = await listPeriodicCogs(ctx.tenantId, parsed.data);
    return NextResponse.json({ data: result.items, meta: { cursor: result.cursor, hasMore: result.hasMore } });
  },
  { entitlement: 'accounting', permission: 'cogs.manage' },
);

export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const action = body.action;

    if (action === 'calculate') {
      const parsed = calculatePeriodicCogsSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
      }
      const result = await calculatePeriodicCogs(ctx.tenantId, parsed.data);
      return NextResponse.json({ data: result }, { status: 201 });
    }

    if (action === 'post') {
      const parsed = postPeriodicCogsSchema.safeParse(body);
      if (!parsed.success) {
        throw new ValidationError('Validation failed', parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
      }
      const result = await postPeriodicCogs(ctx, parsed.data);
      return NextResponse.json({ data: result });
    }

    throw new AppError('VALIDATION_ERROR', 'Invalid action. Expected "calculate" or "post".', 400);
  },
  { entitlement: 'accounting', permission: 'cogs.manage', writeAccess: true },
);
