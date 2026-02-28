import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getJournalDocuments, attachDocument } from '@oppsera/module-accounting';

function extractJournalId(request: NextRequest): string {
  // URL: /api/v1/accounting/journals/[id]/documents
  const segments = request.nextUrl.pathname.split('/');
  return segments[segments.length - 2]!;
}

// GET /api/v1/accounting/journals/:id/documents — list documents for a journal entry
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractJournalId(request);
    const documents = await getJournalDocuments({
      tenantId: ctx.tenantId,
      journalEntryId: id,
    });
    return NextResponse.json({ data: documents });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// POST /api/v1/accounting/journals/:id/documents — attach a document to a journal entry
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractJournalId(request);
    const body = await request.json();
    const result = await attachDocument(ctx, {
      journalEntryId: id,
      fileName: body.fileName,
      fileType: body.fileType,
      fileSizeBytes: body.fileSizeBytes,
      storageKey: body.storageKey,
      description: body.description,
    });
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
