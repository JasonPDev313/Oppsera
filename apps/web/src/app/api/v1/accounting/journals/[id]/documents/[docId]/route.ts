import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { removeDocument } from '@oppsera/module-accounting';

function extractDocId(request: NextRequest): string {
  // URL: /api/v1/accounting/journals/[id]/documents/[docId]
  const segments = request.nextUrl.pathname.split('/');
  return segments[segments.length - 1]!;
}

// DELETE /api/v1/accounting/journals/:id/documents/:docId — remove a document attachment
export const DELETE = withMiddleware(
  async (request: NextRequest, ctx) => {
    const docId = extractDocId(request);
    await removeDocument(ctx, docId);
    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
