import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { generateRetainedEarnings, generateRetainedEarningsSchema } from '@oppsera/module-accounting';

// POST /api/v1/accounting/statements/retained-earnings — generate retained earnings closing entry
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const body = await request.json();
    const input = generateRetainedEarningsSchema.parse(body);
    const result = await generateRetainedEarnings(ctx, input);

    return NextResponse.json({ data: result }, { status: 201 });
  },
  { entitlement: 'accounting', permission: 'accounting.manage' },
);
