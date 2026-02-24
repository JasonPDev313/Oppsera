import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { unarchiveTag } from '@oppsera/module-customers';

function extractId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  // /api/v1/customers/tags/{id}/unarchive → id is at parts.length - 2
  return parts[parts.length - 2]!;
}

// POST /api/v1/customers/tags/:id/unarchive
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const tagId = extractId(request);
    const tag = await unarchiveTag(ctx, tagId);
    return NextResponse.json({ data: tag });
  },
  { entitlement: 'customers', permission: 'customers.tags.manage', writeAccess: true },
);
