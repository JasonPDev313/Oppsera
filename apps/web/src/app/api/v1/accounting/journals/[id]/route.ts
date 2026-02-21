import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { getJournalEntry } from '@oppsera/module-accounting';

function extractId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1]!;
}

// GET /api/v1/accounting/journals/:id — get journal entry with lines
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractId(request);

    const entry = await getJournalEntry({
      tenantId: ctx.tenantId,
      entryId: id,
    });

    return NextResponse.json({ data: entry });
  },
  { entitlement: 'accounting', permission: 'accounting.view' },
);
