import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { postDraftEntry } from '@oppsera/module-accounting';

function extractJournalId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/accounting/journals/:id/post → parts[-2] is the id
  return parts[parts.length - 2]!;
}

// POST /api/v1/accounting/journals/:id/post — post a draft journal entry
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractJournalId(request);

    const entry = await postDraftEntry(ctx, id);
    return NextResponse.json({ data: entry });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' , writeAccess: true },
);
