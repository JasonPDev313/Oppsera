import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { createSegment, createSegmentSchema } from '@oppsera/module-customers';

// GET /api/v1/customers/segments — list segments (stub)
export const GET = withMiddleware(
  async (_request: NextRequest, _ctx) => {
    // TODO: implement listSegments query
    return NextResponse.json({ data: [] });
  },
  { entitlement: 'customers', permission: 'customers.view' },
);

// POST /api/v1/customers/segments — create segment
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = createSegmentSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const segment = await createSegment(ctx, parsed.data);
    return NextResponse.json({ data: segment }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
