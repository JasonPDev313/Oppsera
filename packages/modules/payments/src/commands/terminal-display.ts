import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import type { TerminalDisplayInput } from '../validation/terminal-operations';
import { resolveTerminalContext } from '../helpers/resolve-terminal-context';
import { getTerminalSession } from '../services/terminal-session-manager';
import { CardPointeTerminalClient } from '../providers/cardpointe/terminal-client';

/**
 * Display custom text on the physical terminal screen.
 *
 * Used for:
 * - Surcharge disclosure ("A surcharge of $X.XX will be applied")
 * - Status messages ("Processing your payment...")
 * - Custom prompts
 */
export async function terminalDisplay(
  ctx: RequestContext,
  input: TerminalDisplayInput,
): Promise<{ displayed: true }> {
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

  await client.display(session.sessionKey, {
    hsn: termCtx.device.hsn,
    text: input.text,
  });

  return { displayed: true };
}
