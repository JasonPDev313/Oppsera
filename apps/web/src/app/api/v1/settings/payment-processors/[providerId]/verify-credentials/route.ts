import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withMiddleware } from '@oppsera/core/auth/with-middleware';
import { withTenant, paymentProviderCredentials, paymentMerchantAccounts } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';
import { decryptCredentials, CardPointeClient } from '@oppsera/module-payments';

function extractProviderId(request: NextRequest): string {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.indexOf('payment-processors') + 1]!;
}

export interface VerifyCredentialRow {
  merchantAccountId: string;
  displayName: string;
  merchantId: string;
  accountType: 'Ecom' | 'ACH' | 'Funding';
  mid: string;
  username: string;
  /** Masked password — only last 4 chars */
  password: string;
  status: 'OK' | 'Unauthorized' | 'Timeout' | 'Error' | 'Blank Credentials';
  error?: string;
}

/**
 * POST /api/v1/settings/payment-processors/:providerId/verify-credentials
 *
 * Tests connectivity for all credential types (Ecom, ACH, Funding) across
 * all active merchant accounts for this provider. Returns a tabular report
 * matching the CardConnect POS "Verify Credentials" format.
 *
 * For each merchant account, three rows are tested:
 *   - Ecom: main username/password against the primary merchantId
 *   - ACH: achUsername/achPassword against the achMerchantId (or primary MID)
 *   - Funding: fundingUsername/fundingPassword against the fundingMerchantId (or primary MID)
 *
 * Each test calls the CardPointe inquire endpoint with a dummy retref.
 * Any API response (including "Txn not found") means credentials are valid.
 * 401/403 = Unauthorized. Timeout or network error = Error.
 */
export const POST = withMiddleware(
  async (request: NextRequest, ctx) => {
    const providerId = extractProviderId(request);

    // 1. Get credentials for this provider
    const cred = await withTenant(ctx.tenantId, async (tx) => {
      const [row] = await tx
        .select({
          id: paymentProviderCredentials.id,
          credentialsEncrypted: paymentProviderCredentials.credentialsEncrypted,
          isSandbox: paymentProviderCredentials.isSandbox,
        })
        .from(paymentProviderCredentials)
        .where(
          and(
            eq(paymentProviderCredentials.tenantId, ctx.tenantId),
            eq(paymentProviderCredentials.providerId, providerId),
            eq(paymentProviderCredentials.isActive, true),
          ),
        )
        .limit(1);
      return row ?? null;
    });

    if (!cred) {
      return NextResponse.json(
        { error: { code: 'NO_CREDENTIALS', message: 'No credentials found for this provider. Save credentials first.' } },
        { status: 400 },
      );
    }

    let decrypted: ReturnType<typeof decryptCredentials>;
    try {
      decrypted = decryptCredentials(cred.credentialsEncrypted);
    } catch {
      return NextResponse.json(
        { error: { code: 'DECRYPT_FAILED', message: 'Failed to decrypt stored credentials.' } },
        { status: 500 },
      );
    }

    // 2. Get all active merchant accounts
    const accounts = await withTenant(ctx.tenantId, async (tx) => {
      return tx
        .select({
          id: paymentMerchantAccounts.id,
          merchantId: paymentMerchantAccounts.merchantId,
          displayName: paymentMerchantAccounts.displayName,
          achMerchantId: paymentMerchantAccounts.achMerchantId,
          fundingMerchantId: paymentMerchantAccounts.fundingMerchantId,
        })
        .from(paymentMerchantAccounts)
        .where(
          and(
            eq(paymentMerchantAccounts.tenantId, ctx.tenantId),
            eq(paymentMerchantAccounts.providerId, providerId),
            eq(paymentMerchantAccounts.isActive, true),
          ),
        );
    });

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: { code: 'NO_ACCOUNTS', message: 'No active merchant accounts found for this provider.' } },
        { status: 400 },
      );
    }

    // 3. Build a CardPointe client with main credentials
    const client = new CardPointeClient({
      site: decrypted.site,
      merchantId: accounts[0]!.merchantId,
      username: decrypted.username,
      password: decrypted.password,
      achUsername: decrypted.achUsername,
      achPassword: decrypted.achPassword,
      fundingUsername: decrypted.fundingUsername,
      fundingPassword: decrypted.fundingPassword,
    });

    // 4. For each account, test all three credential types in parallel
    const rows: VerifyCredentialRow[] = [];

    const testPromises = accounts.flatMap((account) => {
      const ecomMid = account.merchantId;
      const achMid = account.achMerchantId || account.merchantId;
      const fundingMid = account.fundingMerchantId || account.merchantId;

      return [
        // Ecom — main credentials
        testCredentialType(client, {
          merchantAccountId: account.id,
          displayName: account.displayName,
          merchantId: account.merchantId,
          accountType: 'Ecom' as const,
          mid: ecomMid,
          username: decrypted.username,
          password: decrypted.password,
          authHeader: client.getMainAuthHeader(),
        }),
        // ACH — ach credentials (falls back to main)
        testCredentialType(client, {
          merchantAccountId: account.id,
          displayName: account.displayName,
          merchantId: account.merchantId,
          accountType: 'ACH' as const,
          mid: achMid,
          username: decrypted.achUsername ?? '',
          password: decrypted.achPassword ?? '',
          authHeader: client.getAchAuthHeader(),
        }),
        // Funding — funding credentials (falls back to main)
        testCredentialType(client, {
          merchantAccountId: account.id,
          displayName: account.displayName,
          merchantId: account.merchantId,
          accountType: 'Funding' as const,
          mid: fundingMid,
          username: decrypted.fundingUsername ?? '',
          password: decrypted.fundingPassword ?? '',
          authHeader: client.getFundingAuthHeader(),
        }),
      ];
    });

    const results = await Promise.all(testPromises);
    rows.push(...results);

    return NextResponse.json({ data: { rows, testedAt: new Date().toISOString() } });
  },
  { entitlement: 'payments', permission: 'settings.update', writeAccess: true },
);

/** Mask a value to show only last 4 characters */
function maskPassword(val: string): string {
  if (!val) return '';
  if (val.length <= 4) return '****';
  return '*'.repeat(val.length - 4) + val.slice(-4);
}

async function testCredentialType(
  client: CardPointeClient,
  params: {
    merchantAccountId: string;
    displayName: string;
    merchantId: string;
    accountType: 'Ecom' | 'ACH' | 'Funding';
    mid: string;
    username: string;
    password: string;
    authHeader: string;
  },
): Promise<VerifyCredentialRow> {
  const { merchantAccountId, displayName, merchantId, accountType, mid, username, password, authHeader } = params;

  // If credentials are blank, report that immediately
  if (!username || !password) {
    return {
      merchantAccountId,
      displayName,
      merchantId,
      accountType,
      mid,
      username: '',
      password: '',
      status: 'Blank Credentials',
      error: `${accountType} user is blank, ${accountType} password is blank`,
    };
  }

  // Test connectivity using the inquire endpoint
  const result = await client.testConnectivity(mid, authHeader);

  let status: VerifyCredentialRow['status'];
  if (result.ok) {
    status = 'OK';
  } else if (result.error === 'Unauthorized') {
    status = 'Unauthorized';
  } else if (result.error === 'Connection timed out') {
    status = 'Timeout';
  } else {
    status = 'Error';
  }

  return {
    merchantAccountId,
    displayName,
    merchantId,
    accountType,
    mid,
    username,
    password: maskPassword(password),
    status,
    error: result.ok ? undefined : result.error,
  };
}
