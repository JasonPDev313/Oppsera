import { auditLogDeferred } from '@oppsera/core/audit/helpers';
import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import { resolveTerminalContext } from '../helpers/resolve-terminal-context';
import { getTerminalSession } from '../services/terminal-session-manager';
import { CardPointeTerminalClient } from '../providers/cardpointe/terminal-client';
import { centsToDollars, dollarsToCents } from '../helpers/amount';

export interface TerminalTipResult {
  tipAmountCents: number;
  tipAmountDollars: string;
}

/**
 * Prompt for a tip on the physical terminal screen and return the selected amount.
 *
 * This command is a pure terminal I/O operation — it does not create any DB records
 * because no payment has been captured yet at this point. The caller is expected to
 * include the returned tipAmountCents in a subsequent terminalAuthCard / terminalReadCard
 * call.
 */
export async function terminalTip(
  ctx: RequestContext,
  input: { terminalId: string; amountCents: number; tipOptions?: string[] },
): Promise<TerminalTipResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  // 1. Resolve device + provider + credentials
  const termCtx = await resolveTerminalContext(ctx.tenantId, ctx.locationId, input.terminalId);

  // 2. Get or create terminal session
  const session = await getTerminalSession({
    tenantId: ctx.tenantId,
    hsn: termCtx.device.hsn,
    merchantId: termCtx.merchantId,
    credentials: termCtx.credentials,
  });

  // 3. Build client and prompt for tip
  const client = new CardPointeTerminalClient({
    site: termCtx.credentials.site,
    merchantId: termCtx.merchantId,
    username: termCtx.credentials.username,
    password: termCtx.credentials.password,
  });

  const tipResponse = await client.tipPrompt(session.sessionKey, {
    hsn: termCtx.device.hsn,
    amount: centsToDollars(input.amountCents),
    tipOptions: input.tipOptions,
  });

  // 4. Audit
  auditLogDeferred(ctx, 'payments.terminal_tip', 'terminal', input.terminalId);

  return {
    tipAmountCents: dollarsToCents(tipResponse.tipAmount),
    tipAmountDollars: tipResponse.tipAmount,
  };
}
