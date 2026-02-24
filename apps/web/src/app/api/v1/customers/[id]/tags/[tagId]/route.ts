import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  removeTagFromCustomer,
  removeTagFromCustomerSchema,
} from '@oppsera/module-customers';

function extractIds(request: NextRequest): { customerId: string; tagId: string } {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/{customerId}/tags/{tagId}
  return {
    customerId: parts[parts.length - 3]!,
    tagId: parts[parts.length - 1]!,
  };
}

// DELETE /api/v1/customers/:id/tags/:tagId
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { customerId, tagId } = extractIds(request);
    const body = await request.json().catch(() => ({}));
    const parsed = removeTagFromCustomerSchema.safeParse({
      reason: body.reason,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }
    const result = await removeTagFromCustomer(ctx, customerId, tagId, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'customers', permission: 'customers.tags.assign', writeAccess: true },
);
