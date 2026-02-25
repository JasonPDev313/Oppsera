import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  closeTab,
  closeTabSchema,
  voidTab,
  voidTabSchema,
  transferTab,
  transferTabSchema,
  reopenTab,
  reopenTabSchema,
} from '@oppsera/module-fnb';

const ACTIONS: Record<string, true> = {
  close: true,
  void: true,
  transfer: true,
  reopen: true,
};

function extractId(request: NextRequest): string {
  const parts = request.nextUrl.pathname.split('/');
  return parts[parts.length - 2]!;
}

function extractAction(request: NextRequest): string {
  return request.nextUrl.pathname.split('/').at(-1)!;
}

// POST /api/v1/fnb/tabs/:id/:action
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const action = extractAction(request);
    if (!ACTIONS[action]) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Unknown action: ${action}` } },
        { status: 404 },
      );
    }
    const tabId = extractId(request);
    const body = await request.json();

    switch (action) {
      case 'close': {
        const parsed = closeTabSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const tab = await closeTab(ctx, tabId, parsed.data);
        return NextResponse.json({ data: tab });
      }
      case 'void': {
        const parsed = voidTabSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const tab = await voidTab(ctx, tabId, parsed.data);
        return NextResponse.json({ data: tab });
      }
      case 'transfer': {
        const parsed = transferTabSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const tab = await transferTab(ctx, tabId, parsed.data);
        return NextResponse.json({ data: tab });
      }
      case 'reopen': {
        const parsed = reopenTabSchema.safeParse(body);
        if (!parsed.success) {
          throw new ValidationError(
            'Validation failed',
            parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          );
        }
        const tab = await reopenTab(ctx, tabId, parsed.data);
        return NextResponse.json({ data: tab });
      }
    }

    // Unreachable — all actions handled above, unknown actions caught by guard
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Unknown action` } },
      { status: 404 },
    );
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
