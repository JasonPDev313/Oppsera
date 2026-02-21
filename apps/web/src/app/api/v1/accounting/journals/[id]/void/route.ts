import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { voidJournalEntry } from '@oppsera/module-accounting';

function extractJournalId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // /api/v1/accounting/journals/:id/void → parts[-2] is the id
  return parts[parts.length - 2]!;
}

// POST /api/v1/accounting/journals/:id/void — void a posted journal entry
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const id = extractJournalId(request);
    const body = await request.json();
    const reason = body.reason;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'reason is required' } },
        { status: 400 },
      );
    }

    const result = await voidJournalEntry(ctx, id, reason.trim());
    return NextResponse.json({ data: result });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
