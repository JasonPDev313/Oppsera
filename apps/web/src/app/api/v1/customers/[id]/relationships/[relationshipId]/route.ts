import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateCustomerRelationship,
  updateRelationshipSchema,
  removeCustomerRelationship,
} from '@oppsera/module-customers';

function extractRelationshipId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const relationshipId = extractRelationshipId(request);
    const body = await request.json();
    const parsed = updateRelationshipSchema.safeParse({ ...body, relationshipId });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const updated = await updateCustomerRelationship(ctx, parsed.data);
    return NextResponse.json({ data: updated });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const relationshipId = extractRelationshipId(request);
    await removeCustomerRelationship(ctx, { relationshipId });
    return NextResponse.json({ data: { id: relationshipId, deleted: true } });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
