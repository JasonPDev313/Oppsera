import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { isEnabled } from '@oppsera/core/config/feature-flags';
import {
  resolveDevice,
  invalidateTerminalSession,
} from '@oppsera/module-payments';

/**
 * POST /api/v1/payments/terminal/disconnect
 * End a terminal session and invalidate the cached session key.
 * Body: { terminalId: string }
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    if (!isEnabled('PAYMENTS_TERMINAL_ENABLED')) {
      throw new AppError('FEATURE_DISABLED', 'Card-present payments are not enabled', 403);
    }

    const body = await request.json();
    const terminalId = body.terminalId;
    if (!terminalId || typeof terminalId !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'terminalId is required', 400);
    }

    const device = await resolveDevice(ctx.tenantId, terminalId);
    if (!device) {
      throw new AppError('NO_DEVICE_ASSIGNED', 'No payment device assigned to this terminal', 422);
    }

    invalidateTerminalSession(ctx.tenantId, device.hsn);

    return NextResponse.json({
      data: { disconnected: true, hsn: device.hsn },
    });
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
