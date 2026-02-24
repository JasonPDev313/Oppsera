import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  bulkAssignModifierGroups,
  bulkAssignModifierGroupsSchema,
} from '@oppsera/module-catalog';

// POST /api/v1/catalog/modifier-groups/bulk-assign — bulk assign groups to items
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const parsed = bulkAssignModifierGroupsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await bulkAssignModifierGroups(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'catalog', permission: 'catalog.manage', writeAccess: true },
);
