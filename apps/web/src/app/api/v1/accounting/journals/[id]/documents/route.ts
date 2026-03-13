import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getJournalDocuments, attachDocument } from '@oppsera/module-accounting';
import { uploadFile, getSignedUrl } from '@oppsera/core/storage';

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

    // Generate signed download URLs for each document
    const withUrls = await Promise.all(
      documents.map(async (doc: Record<string, unknown>) => {
        try {
          const downloadUrl = await getSignedUrl(doc.storageKey as string);
          return { ...doc, downloadUrl };
        } catch {
          return { ...doc, downloadUrl: null };
        }
      }),
    );

    return NextResponse.json({ data: withUrls });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);

// POST /api/v1/accounting/journals/:id/documents — attach a document to a journal entry
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractJournalId(request);
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const description = formData.get('description') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'file is required' } },
        { status: 400 },
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'File size must be under 10 MB' } },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.split('.').pop()?.toLowerCase() ?? 'unknown';

    // Upload to Supabase Storage
    const storageKey = await uploadFile(
      ctx.tenantId,
      file.name,
      fileBuffer,
      file.type || 'application/octet-stream',
    );

    const result = await attachDocument(ctx, {
      journalEntryId: id,
      fileName: file.name,
      fileType,
      fileSizeBytes: file.size,
      storageKey,
      description: description || undefined,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
