import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { AppError } from '@oppsera/shared';
import { isEnabled } from '@oppsera/core/config/feature-flags';
import {
  resolveTerminalContext,
  getTerminalSession,
  CardPointeTerminalClient,
} from '@oppsera/module-payments';

/**
 * POST /api/v1/payments/terminal/ping
 * Check if a terminal device is reachable.
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

    // Ensure we have an active session
    const session = await getTerminalSession({
      tenantId: ctx.tenantId,
      hsn: termCtx.device.hsn,
      merchantId: termCtx.merchantId,
      credentials: termCtx.credentials,
    });

    // Build a one-off client to send the ping
    const client = new CardPointeTerminalClient({
      site: termCtx.credentials.site,
      merchantId: termCtx.merchantId,
      username: termCtx.credentials.username,
      password: termCtx.credentials.password,
    });

    const ping = await client.ping(session.sessionKey, termCtx.device.hsn);

    return NextResponse.json({
      data: {
        reachable: ping.connected,
        hsn: termCtx.device.hsn,
        deviceModel: termCtx.device.deviceModel,
      },
    });
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
