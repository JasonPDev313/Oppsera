import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { archiveInventoryItem, archiveInventoryItemSchema } from '@oppsera/module-inventory';
import { ValidationError } from '@oppsera/shared';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/inventory/{id}/archive → parts[-2] is the id
  return parts[parts.length - 2]!;
}

// POST /api/v1/inventory/:id/archive — archive or unarchive an inventory item
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);
    const body = await request.json();
    const parsed = archiveInventoryItemSchema.safeParse({
      ...body,
      inventoryItemId: id,
    });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await archiveInventoryItem(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'inventory', permission: 'inventory.manage' },
);
