import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { postDraftEntry, voidJournalEntry } from '@oppsera/module-accounting';

const ACTIONS: Record<string, true> = { post: true, void: true };

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/accounting/journals/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const id = extractId(request);

    switch (action) {
      case 'post': {
        const entry = await postDraftEntry(ctx, id);
        return NextResponse.json({ data: entry });
      }
      case 'void': {
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
      }
    }

    // Unreachable — all actions handled above, unknown actions caught by guard
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Unknown action` } },
      { status: 404 },
    );
  },
  { entitlement: 'accounting', permission: 'accounting.manage', writeAccess: true },
);
