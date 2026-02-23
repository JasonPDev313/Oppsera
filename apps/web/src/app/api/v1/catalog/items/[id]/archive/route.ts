import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import { archiveItem, archiveItemSchema } from '@oppsera/module-catalog';

function extractItemId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/catalog/items/:id/archive
  return parts[parts.length - 2]!;
}

// POST /api/v1/catalog/items/:id/archive
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const itemId = extractItemId(request);
    const body = await request.json();
    const parsed = archiveItemSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const item = await archiveItem(ctx, itemId, parsed.data);
    return NextResponse.json({ data: item });
  },
  { entitlement: 'catalog', permission: 'catalog.manage' , writeAccess: true },
);
