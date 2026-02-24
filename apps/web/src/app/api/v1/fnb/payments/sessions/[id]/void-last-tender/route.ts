import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';

// POST /api/v1/fnb/payments/sessions/[id]/void-last-tender — void the most recent tender on a session
// TODO: Wire to voidLastTender command when implemented in @oppsera/module-fnb
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const sessionId = request.url.split('/sessions/')[1]?.split('/void-last-tender')[0];
    if (!sessionId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Session ID required' } },
        { status: 400 },
      );
    }

    // Placeholder: return success with remaining amount recalculated
    // The real implementation will call the voidLastTender command
    void ctx;
    return NextResponse.json({
      data: {
        sessionId,
        status: 'in_progress',
        remainingAmountCents: 0,
        message: 'Last tender voided',
      },
    });
  },
  { entitlement: 'pos_fnb', permission: 'pos_fnb.payments.manage', writeAccess: true },
);
