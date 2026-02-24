import type { RequestContext } from '@oppsera/core/auth/context';
import { AppError } from '@oppsera/shared';
import type { TokenizeBankAccountInput } from '../gateway-validation';
import { resolveProvider } from '../helpers/resolve-provider';

export interface BankTokenResult {
  token: string;
  bankLast4: string;
}

/**
 * Tokenize a bank account via CardSecure.
 * CardSecure tokenizes ACH by sending "routing/account" as a single string.
 * Format: "123456789/1234567890" → CardSecure token
 */
export async function tokenizeBankAccount(
  ctx: RequestContext,
  input: TokenizeBankAccountInput,
): Promise<BankTokenResult> {
  if (!ctx.locationId) {
    throw new AppError('LOCATION_REQUIRED', 'X-Location-Id header is required', 400);
  }

  const { provider } = await resolveProvider(ctx.tenantId, ctx.locationId);

  // CardSecure tokenizes ACH by treating "routing/account" as the "account" field
  const account = `${input.routingNumber}/${input.accountNumber}`;
  const result = await provider.tokenize({ account });

  const bankLast4 = input.accountNumber.slice(-4);

  return {
    token: result.token,
    bankLast4,
  };
}
