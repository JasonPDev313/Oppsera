import { withTenant } from '@oppsera/db';
import {
  paymentProviders,
  paymentProviderCredentials,
} from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import { decryptCredentials } from '../helpers/credentials';

export interface TokenizerConfig {
  site: string;
  iframeUrl: string;
  providerCode: string;
  isSandbox: boolean;
}

/**
 * Get the tokenizer configuration for a tenant/location.
 * Returns ONLY non-sensitive data (site name for iframe URL).
 * Never returns credentials (username, password).
 *
 * Resolution chain for credentials:
 *   1. Location-specific credentials
 *   2. Tenant-wide credentials (location_id IS NULL)
 */
export async function getTokenizerConfig(
  tenantId: string,
  locationId?: string,
): Promise<TokenizerConfig | null> {
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

    if (!providerRow) return null;

    // Only CardPointe supports hosted iFrame tokenizer
    if (providerRow.code !== 'cardpointe') return null;

    // 2. Resolve credentials — location-specific → tenant-wide
    let credentialsRow: { credentialsEncrypted: string; isSandbox: boolean } | undefined;

    if (locationId) {
      const [locCreds] = await tx
        .select({
          credentialsEncrypted: paymentProviderCredentials.credentialsEncrypted,
          isSandbox: paymentProviderCredentials.isSandbox,
        })
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

      if (locCreds) credentialsRow = locCreds;
    }

    if (!credentialsRow) {
      const [tenantCreds] = await tx
        .select({
          credentialsEncrypted: paymentProviderCredentials.credentialsEncrypted,
          isSandbox: paymentProviderCredentials.isSandbox,
        })
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

      if (tenantCreds) credentialsRow = tenantCreds;
    }

    if (!credentialsRow) return null;

    // 3. Extract site name from decrypted credentials (only safe field)
    const credentials = decryptCredentials(credentialsRow.credentialsEncrypted);
    const site = credentials.site;

    return {
      site,
      iframeUrl: `https://${site}.cardconnect.com/itoke/ajax-tokenizer.html`,
      providerCode: providerRow.code,
      isSandbox: credentialsRow.isSandbox,
    };
  });
}
