import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { broadcastFnb } from '@oppsera/core/realtime';
import { ValidationError } from '@oppsera/shared';
import { updateTabItemNote, updateTabItemNoteSchema } from '@oppsera/module-fnb';

function extractIds(request: NextRequest): { tabId: string; itemId: string } {
  const parts = new URL(request.url).pathname.split('/');
  const noteIdx = parts.lastIndexOf('note');
  return { tabId: parts[noteIdx - 3]!, itemId: parts[noteIdx - 1]! };
}

export const PATCH = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { tabId, itemId } = extractIds(request);
    const body = await request.json();

    const parsed = updateTabItemNoteSchema.safeParse({
      specialInstructions: body.specialInstructions ?? null,
    });
    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await updateTabItemNote(ctx, tabId, itemId, parsed.data);
    broadcastFnb(ctx, 'tabs', 'tables').catch(() => {});
    return NextResponse.json({ data: result });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.tabs.manage', writeAccess: true },
);
