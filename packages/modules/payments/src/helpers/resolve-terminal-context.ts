/**
 * Resolve everything needed for a terminal API operation in one call:
 * device assignment + provider credentials + MID + terminal session.
 *
 * Used by all terminal connectivity and card-present API routes.
 */

import { withTenant } from '@oppsera/db';
import {
  paymentProviders,
  paymentProviderCredentials,
  paymentMerchantAccounts,
  terminalMerchantAssignments,
} from '@oppsera/db';
import { eq, and, isNull } from 'drizzle-orm';
import { AppError } from '@oppsera/shared';
import { decryptCredentials } from './credentials';
import { resolveDevice } from './resolve-device';
import type { ResolvedDevice } from './resolve-device';

export interface TerminalContext {
  device: ResolvedDevice;
  merchantId: string;
  credentials: {
    site: string;
    username: string;
    password: string;
  };
}

/**
 * Resolve device + credentials + MID for a given terminal.
 * Throws if no device is assigned, no credentials exist, or no MID is configured.
 */
export async function resolveTerminalContext(
  tenantId: string,
  locationId: string,
  terminalId: string,
): Promise<TerminalContext> {
  // 1. Resolve device
  const device = await resolveDevice(tenantId, terminalId);
  if (!device) {
    throw new AppError(
      'NO_DEVICE_ASSIGNED',
      'No payment device is assigned to this terminal. Assign one in Merchant Processing settings.',
      422,
    );
  }

  // 2. Resolve MID + credentials
  return withTenant(tenantId, async (tx) => {
    // Find active provider
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
      throw new AppError('NO_PAYMENT_PROVIDER', 'No active payment provider configured', 422);
    }

    // Resolve MID: terminal assignment → location default → tenant-wide
    let merchantId: string | undefined;

    // Terminal-specific
    const [assignment] = await tx
      .select({ merchantId: paymentMerchantAccounts.merchantId })
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
      merchantId = assignment.merchantId;
    }

    // Location default
    if (!merchantId) {
      const [locDefault] = await tx
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

      if (locDefault) merchantId = locDefault.merchantId;
    }

    // Tenant-wide default
    if (!merchantId) {
      const [tenantDefault] = await tx
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

      if (tenantDefault) merchantId = tenantDefault.merchantId;
    }

    if (!merchantId) {
      throw new AppError('NO_MERCHANT_ACCOUNT', 'No active merchant account (MID) configured', 422);
    }

    // Resolve credentials: location → tenant-wide
    let credentialsEncrypted: string | undefined;

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
      credentialsEncrypted = locCreds.credentialsEncrypted;
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

      if (tenantCreds) credentialsEncrypted = tenantCreds.credentialsEncrypted;
    }

    if (!credentialsEncrypted) {
      throw new AppError('NO_PAYMENT_CREDENTIALS', 'No payment provider credentials configured', 422);
    }

    const rawCreds = decryptCredentials(credentialsEncrypted) as {
      site: string;
      username: string;
      password: string;
    };

    return {
      device,
      merchantId,
      credentials: rawCreds,
    };
  });
}
