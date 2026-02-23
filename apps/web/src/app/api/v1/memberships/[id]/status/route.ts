import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateMembershipStatus,
  updateMembershipStatusSchema,
} from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// PATCH /api/v1/memberships/:id/status — update membership status (pause, cancel, reactivate, expire)
export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = updateMembershipStatusSchema.safeParse({ ...body, membershipId: id });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const membership = await updateMembershipStatus(ctx, parsed.data);
    return NextResponse.json({ data: membership });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
