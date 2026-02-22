import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { deleteCustomerFile } from '@oppsera/module-customers';

function extractDocumentId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1]!;
}

export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const documentId = extractDocumentId(request);
    await deleteCustomerFile(ctx, { documentId });
    return NextResponse.json({ data: { id: documentId, deleted: true } });
  },
  { entitlement: 'customers', permission: 'customers.manage' },
);
