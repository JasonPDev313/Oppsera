import { withTenant } from '@oppsera/db';
import {
  paymentProviders,
  paymentProviderCredentials,
  paymentMerchantAccounts,
  terminalMerchantAssignments,
} from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import { providerRegistry } from '../providers/registry';
import { decryptCredentials } from './credentials';
import type { PaymentProvider } from '../providers/interface';

export interface ResolvedProvider {
  provider: PaymentProvider;
  providerId: string;
  merchantAccountId: string;
  merchantId: string; // the actual MID string
}

/**
 * Resolve which payment provider + credentials + MID to use.
 *
 * Resolution chain for MID:
 *   1. Terminal-specific assignment (terminal_merchant_assignments)
 *   2. Location default MID (payment_merchant_accounts.is_default WHERE location_id = ?)
 *   3. Tenant-wide default MID (payment_merchant_accounts.is_default WHERE location_id IS NULL)
 *
 * Resolution chain for credentials:
 *   1. Location-specific credentials (payment_provider_credentials WHERE location_id = ?)
 *   2. Tenant-wide credentials (payment_provider_credentials WHERE location_id IS NULL)
 */
export async function resolveProvider(
  tenantId: string,
  locationId: string,
  terminalId?: string,
): Promise<ResolvedProvider> {
  return withTenant(tenantId, async (tx) => {
    // 1. Find active provider for this tenant
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

    if (!providerRow) {
      throw new AppError(
        'NO_PAYMENT_PROVIDER',
        'No active payment provider configured for this tenant',
        422,
      );
    }

    // 2. Resolve MID — terminal assignment → location default → tenant-wide default
    let merchantAccount: { id: string; merchantId: string } | undefined;

    // 2a. Check terminal-specific assignment
    if (terminalId) {
      const [assignment] = await tx
        .select({
          merchantAccountId: terminalMerchantAssignments.merchantAccountId,
          merchantId: paymentMerchantAccounts.merchantId,
          maId: paymentMerchantAccounts.id,
        })
        .from(terminalMerchantAssignments)
        .innerJoin(
          paymentMerchantAccounts,
          eq(terminalMerchantAssignments.merchantAccountId, paymentMerchantAccounts.id),
        )
        .where(
          and(
            eq(terminalMerchantAssignments.tenantId, tenantId),
            eq(terminalMerchantAssignments.terminalId, terminalId),
            eq(terminalMerchantAssignments.isActive, true),
            eq(paymentMerchantAccounts.isActive, true),
          ),
        )
        .limit(1);

      if (assignment) {
        merchantAccount = { id: assignment.maId, merchantId: assignment.merchantId };
      }
    }

    // 2b. Location default MID
    if (!merchantAccount) {
      const [locDefault] = await tx
        .select({ id: paymentMerchantAccounts.id, merchantId: paymentMerchantAccounts.merchantId })
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

      if (locDefault) {
        merchantAccount = locDefault;
      }
    }

    // 2c. Tenant-wide default MID
    if (!merchantAccount) {
      const [tenantDefault] = await tx
        .select({ id: paymentMerchantAccounts.id, merchantId: paymentMerchantAccounts.merchantId })
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

      if (tenantDefault) {
        merchantAccount = tenantDefault;
      }
    }

    if (!merchantAccount) {
      throw new AppError(
        'NO_MERCHANT_ACCOUNT',
        'No active merchant account (MID) configured. Assign a MID in Merchant Services settings.',
        422,
      );
    }

    // 3. Resolve credentials — location-specific → tenant-wide
    let credentialsRow: { credentialsEncrypted: string } | undefined;

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

    if (locCreds) {
      credentialsRow = locCreds;
    } else {
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

      if (tenantCreds) {
        credentialsRow = tenantCreds;
      }
    }

    if (!credentialsRow) {
      throw new AppError(
        'NO_PAYMENT_CREDENTIALS',
        'No payment provider credentials configured. Add credentials in Merchant Services settings.',
        422,
      );
    }

    // 4. Decrypt credentials and instantiate provider
    const credentials = decryptCredentials(credentialsRow.credentialsEncrypted);
    const provider = providerRegistry.get(
      providerRow.code,
      credentials,
      merchantAccount.merchantId,
    );

    return {
      provider,
      providerId: providerRow.id,
      merchantAccountId: merchantAccount.id,
      merchantId: merchantAccount.merchantId,
    };
  });
}
