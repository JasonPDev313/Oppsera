import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  addHouseholdMember,
  addHouseholdMemberSchema,
  removeHouseholdMember,
  removeHouseholdMemberSchema,
} from '@oppsera/module-customers';

function extractHouseholdId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 2]!;
}

// POST /api/v1/customers/households/:id/members — add household member
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const householdId = extractHouseholdId(request);
    const body = await request.json();
    const parsed = addHouseholdMemberSchema.safeParse({ ...body, householdId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const member = await addHouseholdMember(ctx, parsed.data);
    return NextResponse.json({ data: member }, { status: 201 });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);

// DELETE /api/v1/customers/households/:id/members — remove household member
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const householdId = extractHouseholdId(request);
    const body = await request.json();
    const parsed = removeHouseholdMemberSchema.safeParse({ ...body, householdId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await removeHouseholdMember(ctx, parsed.data);
    return new NextResponse(null, { status: 204 });
  },
  { entitlement: 'customers', permission: 'customers.manage' , writeAccess: true },
);
