import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { listPrepNotePresets } from '@oppsera/module-fnb';

// GET /api/v1/fnb/menu/prep-notes — list prep note presets
export const GET = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const items = await listPrepNotePresets({ tenantId: ctx.tenantId });
    return NextResponse.json({ data: items });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.menu.view' },
);
