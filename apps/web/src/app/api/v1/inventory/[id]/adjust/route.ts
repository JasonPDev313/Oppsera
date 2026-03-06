import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { adjustInventory, adjustInventorySchema } from '@oppsera/module-inventory';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // URL: /api/v1/inventory/{id}/adjust → id is at parts[parts.length - 2]
  return parts[parts.length - 2]!;
}

// POST /api/v1/inventory/:id/adjust — quick-adjust inventory quantity
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const inventoryItemId = extractId(request);
    const body = await request.json();
    const parsed = adjustInventorySchema.safeParse({
      ...body,
      inventoryItemId,
      employeeId: body.employeeId || ctx.user.id,
      businessDate: body.businessDate || new Date().toISOString().slice(0, 10),
      clientRequestId: body.clientRequestId || crypto.randomUUID(),
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await adjustInventory(ctx, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'inventory', permission: 'inventory.manage', writeAccess: true },
);
