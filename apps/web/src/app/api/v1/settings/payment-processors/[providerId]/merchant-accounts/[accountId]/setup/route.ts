import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { ValidationError } from '@oppsera/shared';
import {
  updateMerchantAccount,
  updateMerchantAccountSchema,
  saveProviderCredentials,
  saveCredentialsSchema,
  decryptCredentials,
} from '@oppsera/module-payments';
import { withTenant } from '@oppsera/db';
import { paymentMerchantAccounts, paymentProviderCredentials } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

function extractIds(request: NextRequest): { providerId: string; accountId: string } {
  const parts = new URL(request.url).pathname.split('/');
  const providerId = parts[parts.indexOf('payment-processors') + 1]!;
  const accountId = parts[parts.indexOf('merchant-accounts') + 1]!;
  return { providerId, accountId };
}

/**
 * GET /api/v1/settings/payment-processors/:providerId/merchant-accounts/:accountId/setup
 *
 * Returns the full merchant account configuration including masked credential fields.
 * Credential values are masked (only last 4 chars shown) — actual values are never returned.
 */
export const GET = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { providerId, accountId } = extractIds(request);

    const data = await withTenant(ctx.tenantId, async (tx) => {
      // Fetch the merchant account
      const [account] = await tx
        .select()
        .from(paymentMerchantAccounts)
        .where(
          and(
            eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
            eq(paymentMerchantAccounts.id, accountId),
            eq(paymentMerchantAccounts.providerId, providerId),
          ),
        )
        .limit(1);

      if (!account) {
        return null;
      }

      // Fetch credentials for this provider (tenant-wide or location-scoped)
      const [cred] = await tx
        .select()
        .from(paymentProviderCredentials)
        .where(
          and(
            eq(paymentProviderCredentials.tenantId, ctx.tenantId),
            eq(paymentProviderCredentials.providerId, providerId),
            eq(paymentProviderCredentials.isActive, true),
          ),
        )
        .limit(1);

      // Decrypt credentials to build masked preview
      let maskedCredentials: Record<string, string | null> = {
        site: null,
        username: null,
        password: null,
        authorizationKey: null,
        achUsername: null,
        achPassword: null,
        fundingUsername: null,
        fundingPassword: null,
      };
      let credentialId: string | null = null;
      let isSandbox = false;

      if (cred) {
        try {
          const decrypted = decryptCredentials(cred.credentialsEncrypted);
          credentialId = cred.id;
          isSandbox = cred.isSandbox;
          maskedCredentials = {
            site: decrypted.site ?? null,
            username: maskValue(decrypted.username),
            password: maskValue(decrypted.password),
            authorizationKey: maskValue(decrypted.authorizationKey),
            achUsername: maskValue(decrypted.achUsername),
            achPassword: maskValue(decrypted.achPassword),
            fundingUsername: maskValue(decrypted.fundingUsername),
            fundingPassword: maskValue(decrypted.fundingPassword),
          };
        } catch {
          // Credential decryption failed — return nulls
        }
      }

      return {
        account: {
          id: account.id,
          providerId: account.providerId,
          locationId: account.locationId,
          merchantId: account.merchantId,
          displayName: account.displayName,
          isDefault: account.isDefault,
          isActive: account.isActive,
          hsn: account.hsn ?? '',
          achMerchantId: account.achMerchantId ?? '',
          achEnabled: account.achEnabled,
          achDefaultSecCode: account.achDefaultSecCode ?? 'WEB',
          achCompanyName: account.achCompanyName ?? '',
          achCompanyId: account.achCompanyId ?? '',
          fundingMerchantId: account.fundingMerchantId ?? '',
          useForCardSwipe: account.useForCardSwipe,
          readerBeep: account.readerBeep,
          isProduction: account.isProduction,
          allowManualEntry: account.allowManualEntry,
          tipOnDevice: account.tipOnDevice,
        },
        credentials: maskedCredentials,
        credentialId,
        isSandbox,
      };
    });

    if (!data) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Merchant account not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data });
  },
  { entitlement: 'payments', permission: 'settings.update' },
);

/**
 * PUT /api/v1/settings/payment-processors/:providerId/merchant-accounts/:accountId/setup
 *
 * Unified save for the Merchant Account Setup page.
 * Saves both the merchant account settings AND provider credentials in one call.
 */
export const PUT = withMiddleware(
  async (request: NextRequest, ctx) => {
    const { providerId, accountId } = extractIds(request);
    const body = await request.json();

    // ── 1. Update merchant account settings ──
    const accountUpdate = updateMerchantAccountSchema.safeParse({
      merchantAccountId: accountId,
      displayName: body.displayName,
      hsn: body.hsn || null,
      achMerchantId: body.achMerchantId || null,
      fundingMerchantId: body.fundingMerchantId || null,
      useForCardSwipe: body.useForCardSwipe,
      readerBeep: body.readerBeep,
      isProduction: body.isProduction,
      allowManualEntry: body.allowManualEntry,
      tipOnDevice: body.tipOnDevice,
    });

    if (!accountUpdate.success) {
      throw new ValidationError(
        'Account validation failed',
        accountUpdate.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      );
    }

    await updateMerchantAccount(ctx, accountUpdate.data);

    // ── 2. Save credentials if any credential fields are provided ──
    // Only save if the user provided actual values (not masked placeholders).
    // The frontend sends empty strings for unchanged fields.
    if (body.credentials && body.credentials.username && body.credentials.password) {
      const credInput = saveCredentialsSchema.safeParse({
        providerId,
        credentials: {
          site: body.credentials.site,
          username: body.credentials.username,
          password: body.credentials.password,
          authorizationKey: body.credentials.authorizationKey || undefined,
          achUsername: body.credentials.achUsername || undefined,
          achPassword: body.credentials.achPassword || undefined,
          fundingUsername: body.credentials.fundingUsername || undefined,
          fundingPassword: body.credentials.fundingPassword || undefined,
        },
        isSandbox: !body.isProduction,
      });

      if (!credInput.success) {
        throw new ValidationError(
          'Credential validation failed',
          credInput.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        );
      }

      await saveProviderCredentials(ctx, credInput.data);
    }

    return NextResponse.json({ data: { success: true } });
  },
  { entitlement: 'payments', permission: 'settings.update', writeAccess: true },
);

/** Mask a value, showing only the last 4 chars. */
function maskValue(val: string | undefined | null): string | null {
  if (!val) return null;
  if (val.length <= 4) return '****';
  return '*'.repeat(val.length - 4) + val.slice(-4);
}
