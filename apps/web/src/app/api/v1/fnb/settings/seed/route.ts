import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { seedFnbSettings } from '@oppsera/module-fnb';

// POST /api/v1/fnb/settings/seed — seed default settings
export const POST = withMiddleware(
  async (_request: NextRequest, ctx) => {
    const result = await seedFnbSettings(ctx);
    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.settings.manage' , writeAccess: true },
);
