import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  addToSegment,
  addToSegmentSchema,
  removeFromSegment,
  removeFromSegmentSchema,
} from '@oppsera/module-customers';

function extractSegmentId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/customers/segments/:id/members — add customer to segment
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segmentId = extractSegmentId(request);
    const body = await request.json();
    const parsed = addToSegmentSchema.safeParse({ ...body, segmentId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await addToSegment(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);

// DELETE /api/v1/customers/segments/:id/members — remove customer from segment
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const segmentId = extractSegmentId(request);
    const body = await request.json();
    const parsed = removeFromSegmentSchema.safeParse({ ...body, segmentId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await removeFromSegment(ctx, parsed.data);
    return new NextResponse(null, { status: 204 });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
