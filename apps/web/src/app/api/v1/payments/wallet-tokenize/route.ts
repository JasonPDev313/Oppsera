import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import type { TokenizeResult } from '@oppsera/shared';
import { withTenant } from '@oppsera/db';
import {
  paymentProviders,
  paymentProviderCredentials,
  paymentMerchantAccounts,
} from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import {
  decryptCredentials,
  CardPointeClient,
} from '@oppsera/module-payments';

const MAX_APPLE_PAY_TOKEN_AGE_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Resolve the CardPointe client config (credentials + MID) for the tenant.
 * Similar to resolveProvider but returns raw config for CardPointeClient
 * instead of the abstracted PaymentProvider interface, because wallet
 * tokenization uses the CardSecure endpoint directly.
 */
async function resolveCardPointeConfig(
  tenantId: string,
  locationId: string,
): Promise<{ site: string; merchantId: string; username: string; password: string } | null> {
  return withTenant(tenantId, async (tx) => {
    // 1. Find active provider
    const [providerRow] = await tx
      .select()
      .from(paymentProviders)
      .where(
        and(
          eq(paymentProviders.tenantId, tenantId),
          eq(paymentProviders.isActive, true),
        ),
      )
      .limit(1);

    if (!providerRow || providerRow.code !== 'cardpointe') return null;

    // 2. Resolve MID: location default -> tenant-wide default
    let merchantId: string | undefined;

    const [locMid] = await tx
      .select({ merchantId: paymentMerchantAccounts.merchantId })
      .from(paymentMerchantAccounts)
      .where(
        and(
          eq(paymentMerchantAccounts.tenantId, tenantId),
          eq(paymentMerchantAccounts.providerId, providerRow.id),
          eq(paymentMerchantAccounts.locationId, locationId),
          eq(paymentMerchantAccounts.isDefault, true),
          eq(paymentMerchantAccounts.isActive, true),
        ),
      )
      .limit(1);

    if (locMid) {
      merchantId = locMid.merchantId;
    } else {
      const [tenantMid] = await tx
        .select({ merchantId: paymentMerchantAccounts.merchantId })
        .from(paymentMerchantAccounts)
        .where(
          and(
            eq(paymentMerchantAccounts.tenantId, tenantId),
            eq(paymentMerchantAccounts.providerId, providerRow.id),
            isNull(paymentMerchantAccounts.locationId),
            eq(paymentMerchantAccounts.isDefault, true),
            eq(paymentMerchantAccounts.isActive, true),
          ),
        )
        .limit(1);

      if (tenantMid) merchantId = tenantMid.merchantId;
    }

    if (!merchantId) return null;

    // 3. Resolve credentials: location-specific -> tenant-wide
    let credRow: { credentialsEncrypted: string } | undefined;

    if (locationId) {
      const [locCreds] = await tx
        .select({ credentialsEncrypted: paymentProviderCredentials.credentialsEncrypted })
        .from(paymentProviderCredentials)
        .where(
          and(
            eq(paymentProviderCredentials.tenantId, tenantId),
            eq(paymentProviderCredentials.providerId, providerRow.id),
            eq(paymentProviderCredentials.locationId, locationId),
            eq(paymentProviderCredentials.isActive, true),
          ),
        )
        .limit(1);
      if (locCreds) credRow = locCreds;
    }

    if (!credRow) {
      const [tenantCreds] = await tx
        .select({ credentialsEncrypted: paymentProviderCredentials.credentialsEncrypted })
        .from(paymentProviderCredentials)
        .where(
          and(
            eq(paymentProviderCredentials.tenantId, tenantId),
            eq(paymentProviderCredentials.providerId, providerRow.id),
            isNull(paymentProviderCredentials.locationId),
            eq(paymentProviderCredentials.isActive, true),
          ),
        )
        .limit(1);
      if (tenantCreds) credRow = tenantCreds;
    }

    if (!credRow) return null;

    const credentials = decryptCredentials(credRow.credentialsEncrypted);
    return {
      site: credentials.site,
      merchantId,
      username: credentials.username,
      password: credentials.password,
    };
  });
}

/**
 * POST /api/v1/payments/wallet-tokenize
 *
 * Tokenize Apple Pay or Google Pay wallet data via CardPointe CardSecure.
 * Returns a provider-agnostic TokenizeResult.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: { walletType?: string; paymentData?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const { walletType, paymentData } = body;

    // ── Validate walletType ──────────────────────────────────────
    if (walletType !== 'apple_pay' && walletType !== 'google_pay') {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: "walletType must be 'apple_pay' or 'google_pay'",
          },
        },
        { status: 400 },
      );
    }

    if (!paymentData || typeof paymentData !== 'object') {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'paymentData is required and must be an object',
          },
        },
        { status: 400 },
      );
    }

    // ── Apple Pay timestamp check ────────────────────────────────
    if (walletType === 'apple_pay') {
      const header = paymentData.header as Record<string, unknown> | undefined;
      const transactionTime = header?.transactionTime;
      if (transactionTime && typeof transactionTime === 'number') {
        const ageMs = Date.now() - transactionTime;
        if (ageMs > MAX_APPLE_PAY_TOKEN_AGE_MS) {
          return NextResponse.json(
            {
              error: {
                code: 'WALLET_TOKEN_EXPIRED',
                message: 'Apple Pay token is older than 2 minutes. Please retry the payment.',
              },
            },
            { status: 400 },
          );
        }
      }
    }

    try {
      // ── Resolve CardPointe client config ─────────────────────
      const locationId = ctx.locationId ?? '';
      const clientConfig = await resolveCardPointeConfig(ctx.tenantId, locationId);

      if (!clientConfig) {
        return NextResponse.json(
          {
            error: {
              code: 'NO_PAYMENT_CREDENTIALS',
              message: 'No payment provider or credentials configured for wallet tokenization.',
            },
          },
          { status: 422 },
        );
      }

      const client = new CardPointeClient(clientConfig);

      // ── Base64-encode the wallet payment data ─────────────────
      const encodedPayload = Buffer.from(JSON.stringify(paymentData)).toString('base64');

      // ── Tokenize via CardSecure ────────────────────────────────
      let tokenResult: { token: string };

      if (walletType === 'apple_pay') {
        // Apple Pay: no encryptionhandler needed
        tokenResult = await client.tokenizeWalletData(encodedPayload);
      } else {
        // Google Pay: requires EC_GOOGLE_PAY encryption handler
        tokenResult = await client.tokenizeWalletData(encodedPayload, 'EC_GOOGLE_PAY');
      }

      // ── Build normalized response ──────────────────────────────
      const result: TokenizeResult = {
        provider: 'cardpointe',
        token: tokenResult.token,
        last4: null,
        brand: null,
        expMonth: null,
        expYear: null,
        source: walletType === 'apple_pay' ? 'apple_pay' : 'google_pay',
        metadata: { walletType },
      };

      return NextResponse.json({ data: result });
    } catch (err) {
      console.error('[wallet-tokenize] Error:', err);

      const message =
        err instanceof Error ? err.message : 'Wallet tokenization failed';

      return NextResponse.json(
        { error: { code: 'WALLET_TOKENIZE_FAILED', message } },
        { status: 400 },
      );
    }
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
