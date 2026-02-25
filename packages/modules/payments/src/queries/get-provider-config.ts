import { withTenant } from '@oppsera/db';
import {
  paymentProviders,
  paymentProviderCredentials,
  paymentMerchantAccounts,
  terminalMerchantAssignments,
} from '@oppsera/db';
import { eq, and, desc } from 'drizzle-orm';

// ── Types ──────────────────────────────────────────────────────────

export interface ProviderSummary {
  id: string;
  code: string;
  displayName: string;
  providerType: string;
  isActive: boolean;
  config: Record<string, unknown> | null;
  hasCredentials: boolean;
  isSandbox: boolean;
  merchantAccountCount: number;
  createdAt: string;
}

export interface CredentialInfo {
  id: string;
  providerId: string;
  locationId: string | null;
  isSandbox: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Note: credentials are NEVER returned to frontend
}

export interface MerchantAccountInfo {
  id: string;
  providerId: string;
  locationId: string | null;
  merchantId: string;
  displayName: string;
  isDefault: boolean;
  isActive: boolean;
  config: Record<string, unknown> | null;
  createdAt: string;
}

export interface TerminalAssignmentInfo {
  id: string;
  terminalId: string;
  merchantAccountId: string;
  merchantId: string;
  merchantDisplayName: string;
  isActive: boolean;
}

// ── Queries ────────────────────────────────────────────────────────

/**
 * List all payment providers for a tenant.
 * Includes summary info (credential status, MID count).
 */
export async function listPaymentProviders(tenantId: string): Promise<ProviderSummary[]> {
  return withTenant(tenantId, async (tx) => {
    // Single query with subqueries — eliminates N+1
    const credentialSubquery = tx
      .select({
        providerId: paymentProviderCredentials.providerId,
        isSandbox: sql<boolean>`bool_or(${paymentProviderCredentials.isSandbox})`.as('is_sandbox'),
        hasCredentials: sql<boolean>`true`.as('has_creds'),
      })
      .from(paymentProviderCredentials)
      .where(
        and(
          eq(paymentProviderCredentials.tenantId, tenantId),
          eq(paymentProviderCredentials.isActive, true),
        ),
      )
      .groupBy(paymentProviderCredentials.providerId)
      .as('creds');

    const midCountSubquery = tx
      .select({
        providerId: paymentMerchantAccounts.providerId,
        midCount: count(paymentMerchantAccounts.id).as('mid_count'),
      })
      .from(paymentMerchantAccounts)
      .where(
        and(
          eq(paymentMerchantAccounts.tenantId, tenantId),
          eq(paymentMerchantAccounts.isActive, true),
        ),
      )
      .groupBy(paymentMerchantAccounts.providerId)
      .as('mids');

    const rows = await tx
      .select({
        id: paymentProviders.id,
        code: paymentProviders.code,
        displayName: paymentProviders.displayName,
        providerType: paymentProviders.providerType,
        isActive: paymentProviders.isActive,
        config: paymentProviders.config,
        createdAt: paymentProviders.createdAt,
        hasCredentials: credentialSubquery.hasCredentials,
        isSandbox: credentialSubquery.isSandbox,
        merchantAccountCount: midCountSubquery.midCount,
      })
      .from(paymentProviders)
      .leftJoin(credentialSubquery, eq(paymentProviders.id, credentialSubquery.providerId))
      .leftJoin(midCountSubquery, eq(paymentProviders.id, midCountSubquery.providerId))
      .where(eq(paymentProviders.tenantId, tenantId))
      .orderBy(desc(paymentProviders.createdAt));

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      displayName: r.displayName,
      providerType: r.providerType,
      isActive: r.isActive,
      config: r.config as Record<string, unknown> | null,
      hasCredentials: !!r.hasCredentials,
      isSandbox: r.isSandbox ?? false,
      merchantAccountCount: Number(r.merchantAccountCount ?? 0),
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

/**
 * Get credential info for a provider (WITHOUT decrypted values).
 */
export async function listProviderCredentials(
  tenantId: string,
  providerId: string,
): Promise<CredentialInfo[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: paymentProviderCredentials.id,
        providerId: paymentProviderCredentials.providerId,
        locationId: paymentProviderCredentials.locationId,
        isSandbox: paymentProviderCredentials.isSandbox,
        isActive: paymentProviderCredentials.isActive,
        createdAt: paymentProviderCredentials.createdAt,
        updatedAt: paymentProviderCredentials.updatedAt,
      })
      .from(paymentProviderCredentials)
      .where(
        and(
          eq(paymentProviderCredentials.tenantId, tenantId),
          eq(paymentProviderCredentials.providerId, providerId),
        ),
      )
      .orderBy(paymentProviderCredentials.locationId);

    return rows.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      locationId: r.locationId,
      isSandbox: r.isSandbox,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}

/**
 * List merchant accounts (MIDs) for a provider.
 */
export async function listMerchantAccounts(
  tenantId: string,
  providerId: string,
): Promise<MerchantAccountInfo[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(paymentMerchantAccounts)
      .where(
        and(
          eq(paymentMerchantAccounts.tenantId, tenantId),
          eq(paymentMerchantAccounts.providerId, providerId),
        ),
      )
      .orderBy(desc(paymentMerchantAccounts.isDefault), paymentMerchantAccounts.displayName);

    return rows.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      locationId: r.locationId,
      merchantId: r.merchantId,
      displayName: r.displayName,
      isDefault: r.isDefault,
      isActive: r.isActive,
      config: r.config as Record<string, unknown> | null,
      createdAt: r.createdAt.toISOString(),
    }));
  });
}

/**
 * List terminal → MID assignments.
 */
export async function listTerminalAssignments(tenantId: string): Promise<TerminalAssignmentInfo[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: terminalMerchantAssignments.id,
        terminalId: terminalMerchantAssignments.terminalId,
        merchantAccountId: terminalMerchantAssignments.merchantAccountId,
        isActive: terminalMerchantAssignments.isActive,
        merchantId: paymentMerchantAccounts.merchantId,
        merchantDisplayName: paymentMerchantAccounts.displayName,
      })
      .from(terminalMerchantAssignments)
      .innerJoin(
        paymentMerchantAccounts,
        eq(terminalMerchantAssignments.merchantAccountId, paymentMerchantAccounts.id),
      )
      .where(eq(terminalMerchantAssignments.tenantId, tenantId));

    return rows.map((r) => ({
      id: r.id,
      terminalId: r.terminalId,
      merchantAccountId: r.merchantAccountId,
      merchantId: r.merchantId,
      merchantDisplayName: r.merchantDisplayName,
      isActive: r.isActive,
    }));
  });
}
