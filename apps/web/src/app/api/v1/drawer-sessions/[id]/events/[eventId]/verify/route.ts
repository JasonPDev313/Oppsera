import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { verifyCashDrop, verifyCashDropSchema } from '@oppsera/core/drawer-sessions';
import { ValidationError } from '@oppsera/shared';

function extractEventId(request: NextRequest): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  // URL: /api/v1/drawer-sessions/[id]/events/[eventId]/verify — eventId is second-to-last
  return parts[parts.length - 2]!;
}

// POST /api/v1/drawer-sessions/[id]/events/[eventId]/verify — Verify a sealed cash drop
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const eventId = extractEventId(request);
    const parsed = verifyCashDropSchema.safeParse({ eventId });

    if (!parsed.success) {
      throw new ValidationError(
        'Validation failed',
        parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    const result = await verifyCashDrop(ctx, parsed.data);
    return NextResponse.json({ data: result });
  },
  { entitlement: 'orders', permission: 'cash.drop' },
);
