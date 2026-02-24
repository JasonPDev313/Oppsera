import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import type { TerminalReadCardInput } from '../validation/terminal-operations';
import { resolveTerminalContext } from '../helpers/resolve-terminal-context';
import { getTerminalSession } from '../services/terminal-session-manager';
import { CardPointeTerminalClient } from '../providers/cardpointe/terminal-client';
import { normalizeEntryMode } from '../providers/cardpointe/terminal-types';
import type { EntryMode } from '../providers/cardpointe/terminal-types';
import { centsToDollars } from '../helpers/amount';

export interface ReadCardResult {
  token: string;
  cardLast4: string;
  cardBrand: string;
  binType: string | null;
  expiry: string | null;
  entryMode: EntryMode;
}

/**
 * Read card data from a physical terminal without authorizing a payment.
 *
 * Used for:
 * - BIN check before surcharge calculation (is it credit/debit/prepaid?)
 * - Card-on-file capture (tokenize at terminal, charge later)
 */
export async function terminalReadCard(
  ctx: RequestContext,
  input: TerminalReadCardInput,
): Promise<ReadCardResult> {
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

  const response = await client.readCard(session.sessionKey, {
    hsn: termCtx.device.hsn,
    amount: input.amountCents ? centsToDollars(input.amountCents) : undefined,
    beep: true,
  });

  return {
    token: response.token,
    cardLast4: response.cardLast4,
    cardBrand: response.cardBrand,
    binType: response.binType ?? null,
    expiry: response.expiry ?? null,
    entryMode: normalizeEntryMode(response.entryMode),
  };
}
