import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { isEnabled } from '@oppsera/core/config/feature-flags';
import {
  resolveTerminalContext,
  getTerminalSession,
} from '@oppsera/module-payments';

/**
 * POST /api/v1/payments/terminal/connect
 * Establish a session with a physical payment terminal.
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

    if (!ctx.locationId) {
      throw new AppError('VALIDATION_ERROR', 'Location context is required for terminal operations', 400);
    }
    const termCtx = await resolveTerminalContext(ctx.tenantId, ctx.locationId, terminalId);

    await getTerminalSession({
      tenantId: ctx.tenantId,
      hsn: termCtx.device.hsn,
      merchantId: termCtx.merchantId,
      credentials: termCtx.credentials,
    });

    return NextResponse.json({
      data: {
        connected: true,
        hsn: termCtx.device.hsn,
        deviceModel: termCtx.device.deviceModel,
        deviceLabel: termCtx.device.deviceLabel,
      },
    });
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
