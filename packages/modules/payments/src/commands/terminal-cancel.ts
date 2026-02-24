import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import type { TerminalCancelInput } from '../validation/terminal-operations';
import { resolveTerminalContext } from '../helpers/resolve-terminal-context';
import { getTerminalSession } from '../services/terminal-session-manager';
import { CardPointeTerminalClient } from '../providers/cardpointe/terminal-client';

/**
 * Cancel any pending terminal operation (e.g., waiting for card dip/tap).
 *
 * Used when:
 * - User clicks "Cancel" in the POS while terminal is waiting for card
 * - Payment is abandoned before card interaction
 */
export async function terminalCancel(
  ctx: RequestContext,
  input: TerminalCancelInput,
): Promise<{ cancelled: true }> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const termCtx = await resolveTerminalContext(ctx.tenantId, ctx.locationId, input.terminalId);

  const session = await getTerminalSession({
    tenantId: ctx.tenantId,
    hsn: termCtx.device.hsn,
    merchantId: termCtx.merchantId,
    credentials: termCtx.credentials,
  });

  const client = new CardPointeTerminalClient({
    site: termCtx.credentials.site,
    merchantId: termCtx.merchantId,
    username: termCtx.credentials.username,
    password: termCtx.credentials.password,
  });

  await client.cancel(session.sessionKey, { hsn: termCtx.device.hsn });

  return { cancelled: true };
}
