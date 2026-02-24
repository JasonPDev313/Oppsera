import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
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

/**
 * POST /api/v1/payments/apple-pay/validate-merchant
 *
 * Apple Pay merchant session validation.
 * Called during `onvalidatemerchant` in the Apple Pay JS flow.
 * Proxies the validation request through CardPointe to Apple's servers.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    let body: { validationURL?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 },
      );
    }

    const { validationURL } = body;

    if (!validationURL || typeof validationURL !== 'string') {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'validationURL is required and must be a string',
          },
        },
        { status: 400 },
      );
    }

    // ── SSRF prevention ──────────────────────────────────────────
    // Apple Pay validation URLs always start with https://apple-pay-gateway
    if (!validationURL.startsWith('https://apple-pay-gateway')) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'validationURL must be an Apple Pay gateway URL',
          },
        },
        { status: 400 },
      );
    }

    try {
      // ── Resolve CardPointe client config ─────────────────────
      const locationId = ctx.locationId ?? '';

      const clientConfig = await withTenant(ctx.tenantId, async (tx) => {
        // 1. Find active CardPointe provider
        const [providerRow] = await tx
          .select()
          .from(paymentProviders)
          .where(
            and(
              eq(paymentProviders.tenantId, ctx.tenantId),
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
              eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
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
                eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
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
                eq(paymentProviderCredentials.tenantId, ctx.tenantId),
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
                eq(paymentProviderCredentials.tenantId, ctx.tenantId),
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

      if (!clientConfig) {
        return NextResponse.json(
          {
            error: {
              code: 'NO_PAYMENT_CREDENTIALS',
              message: 'No payment provider or credentials configured for Apple Pay.',
            },
          },
          { status: 422 },
        );
      }

      const client = new CardPointeClient(clientConfig);

      // ── Validate merchant session via CardPointe proxy ────────
      const domainName = request.headers.get('host') ?? '';
      const merchantSession = await client.getApplePaySession(
        validationURL,
        domainName,
        'Oppsera',
      );

      return NextResponse.json({ data: merchantSession });
    } catch (err) {
      console.error('[apple-pay/validate-merchant] Error:', err);

      const message =
        err instanceof Error ? err.message : 'Apple Pay merchant validation failed';

      return NextResponse.json(
        { error: { code: 'APPLE_PAY_VALIDATION_FAILED', message } },
        { status: 400 },
      );
    }
  },
  { entitlement: 'payments', permission: 'tenders.create' },
);
