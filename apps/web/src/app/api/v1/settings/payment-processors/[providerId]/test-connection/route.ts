import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, paymentProviderCredentials, paymentMerchantAccounts } from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import { decryptCredentials, providerRegistry } from '@oppsera/module-payments';

function extractProviderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.indexOf('payment-processors') + 1]!;
}

/**
 * POST /api/v1/settings/payment-processors/:providerId/test-connection
 *
 * Test the connection to the payment provider.
 * Decrypts stored credentials, instantiates provider, calls health check.
 *
 * Body (optional):
 *   - locationId: test location-specific credentials
 *   - credentials: { site, username, password } — use these instead of stored
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const providerId = extractProviderId(request);
    const body = await request.json().catch(() => ({}));
    const locationId = body.locationId as string | undefined;
    const inlineCredentials = body.credentials as { site: string; username: string; password: string } | undefined;

    // Resolve credentials
    let credentials: { site: string; username: string; password: string };

    if (inlineCredentials) {
      // Use inline credentials (for first-time setup)
      credentials = inlineCredentials;
    } else {
      // Decrypt stored credentials
      const cred = await withTenant(ctx.tenantId, async (tx) => {
        // Try location-specific first, then tenant-wide
        const rows = await tx
          .select({ credentialsEncrypted: paymentProviderCredentials.credentialsEncrypted })
          .from(paymentProviderCredentials)
          .where(
            and(
              eq(paymentProviderCredentials.tenantId, ctx.tenantId),
              eq(paymentProviderCredentials.providerId, providerId),
              eq(paymentProviderCredentials.isActive, true),
              locationId
                ? eq(paymentProviderCredentials.locationId, locationId)
                : isNull(paymentProviderCredentials.locationId),
            ),
          )
          .limit(1);

        if (rows.length === 0 && locationId) {
          // Fallback to tenant-wide
          const [tenantWide] = await tx
            .select({ credentialsEncrypted: paymentProviderCredentials.credentialsEncrypted })
            .from(paymentProviderCredentials)
            .where(
              and(
                eq(paymentProviderCredentials.tenantId, ctx.tenantId),
                eq(paymentProviderCredentials.providerId, providerId),
                eq(paymentProviderCredentials.isActive, true),
              ),
            )
            .limit(1);
          return tenantWide ?? null;
        }

        return rows[0] ?? null;
      });

      if (!cred) {
        return NextResponse.json(
          { error: { code: 'NO_CREDENTIALS', message: 'No credentials found for this provider' } },
          { status: 400 },
        );
      }

      credentials = decryptCredentials(cred.credentialsEncrypted);
    }

    // Find a merchant ID to use for the test
    const merchantId = await withTenant(ctx.tenantId, async (tx) => {
      const [account] = await tx
        .select({ merchantId: paymentMerchantAccounts.merchantId })
        .from(paymentMerchantAccounts)
        .where(
          and(
            eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
            eq(paymentMerchantAccounts.providerId, providerId),
            eq(paymentMerchantAccounts.isActive, true),
          ),
        )
        .limit(1);
      return account?.merchantId ?? body.merchantId ?? '';
    });

    // Instantiate provider and test connection
    try {
      if (!providerRegistry.has('cardpointe')) {
        return NextResponse.json(
          { error: { code: 'PROVIDER_NOT_REGISTERED', message: 'CardPointe provider not registered in runtime' } },
          { status: 500 },
        );
      }

      const provider = providerRegistry.get('cardpointe', credentials, merchantId || 'test');

      // Call inquire with a dummy retref to test connectivity
      // Some providers have a health/ping endpoint; CardPointe doesn't,
      // so we test by trying to inquire a non-existent transaction.
      // A "Txn not found" error means connectivity is working.
      const testResult = await provider.inquire(
        'connectivity-test-00000',
        merchantId || 'test',
      );

      // Any response means connectivity works (even "not found")
      return NextResponse.json({
        data: {
          success: true,
          message: 'Connection to CardPointe successful',
          details: {
            site: credentials.site,
            merchantId: merchantId || '(none configured)',
            responseStatus: testResult.status,
          },
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // "Transaction not found" or similar errors mean connectivity IS working
      if (message.includes('not found') || message.includes('Txn not found')) {
        return NextResponse.json({
          data: {
            success: true,
            message: 'Connection to CardPointe successful (test transaction not found — expected)',
            details: { site: credentials.site, merchantId: merchantId || '(none configured)' },
          },
        });
      }

      return NextResponse.json({
        data: {
          success: false,
          message: 'Connection failed',
          error: message,
          details: { site: credentials.site },
        },
      });
    }
  },
  { entitlement: 'payments', permission: 'settings.update', writeAccess: true },
);
