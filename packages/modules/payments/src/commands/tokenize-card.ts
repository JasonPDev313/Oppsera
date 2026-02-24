import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import type { TokenizeCardInput } from '../gateway-validation';
import type { TokenResult } from '../types/gateway-results';
import { resolveProvider } from '../helpers/resolve-provider';

/**
 * Server-side card tokenization via CardSecure.
 * In practice, the Hosted iFrame already returns a token client-side.
 * This command exists for server-side flows (importing cards, terminal reads).
 */
export async function tokenizeCard(
  ctx: RequestContext,
  input: TokenizeCardInput,
): Promise<TokenResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const { provider } = await resolveProvider(ctx.tenantId, ctx.locationId);

  const result = await provider.tokenize({
    account: input.account,
    expiry: input.expiry,
  });

  return {
    token: result.token,
    cardLast4: result.cardLast4,
    cardBrand: result.cardBrand,
    expiry: result.expiry,
  };
}
