import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { eq, and, asc, ne, gte } from 'drizzle-orm';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { db, registerTabs } from '@oppsera/db';
import { ValidationError } from '@oppsera/shared';
import {
  createRegisterTab,
  createRegisterTabSchema,
} from '@oppsera/core/register-tabs';

// GET /api/v1/register-tabs?terminalId=xxx&locationId=xxx&since=ISO — list tabs
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const url = new URL(request.url);
    const terminalId = url.searchParams.get('terminalId');
    const locationId = url.searchParams.get('locationId');
    const since = url.searchParams.get('since');

    if (!terminalId && !locationId) {
      throw new ValidationError('terminalId or locationId is required', [
        { field: 'terminalId', message: 'terminalId or locationId query parameter is required' },
      ]);
    }

    const conditions = [
      eq(registerTabs.tenantId, ctx.tenantId),
      ne(registerTabs.status, 'closed'),
    ];

    if (terminalId) {
      conditions.push(eq(registerTabs.terminalId, terminalId));
    }
    if (locationId) {
      conditions.push(eq(registerTabs.locationId, locationId));
    }
    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        conditions.push(gte(registerTabs.updatedAt, sinceDate));
      }
    }

    const rows = await db
      .select()
      .from(registerTabs)
      .where(and(...conditions))
      .orderBy(asc(registerTabs.tabNumber));

    return NextResponse.json({
      data: rows,
      meta: { serverTimestamp: new Date().toISOString() },
    });
  },
  { entitlement: 'orders', permission: 'orders.create' },
);

// POST /api/v1/register-tabs — create a new tab
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createRegisterTabSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await createRegisterTab(ctx, parsed.data);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'orders', permission: 'orders.create' },
);
