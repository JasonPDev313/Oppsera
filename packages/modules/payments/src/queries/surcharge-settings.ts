import { withTenant, surchargeSettings } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

export interface SurchargeSettingsInfo {
  id: string;
  providerId: string;
  locationId: string | null;
  terminalId: string | null;
  isEnabled: boolean;
  surchargeRate: string;
  maxSurchargeRate: string;
  applyToCreditOnly: boolean;
  exemptDebit: boolean;
  exemptPrepaid: boolean;
  customerDisclosureText: string | null;
  receiptDisclosureText: string | null;
  prohibitedStates: string[];
  glAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapRow(row: typeof surchargeSettings.$inferSelect): SurchargeSettingsInfo {
  return {
    id: row.id,
    providerId: row.providerId,
    locationId: row.locationId,
    terminalId: row.terminalId,
    isEnabled: row.isEnabled,
    surchargeRate: String(row.surchargeRate),
    maxSurchargeRate: String(row.maxSurchargeRate),
    applyToCreditOnly: row.applyToCreditOnly,
    exemptDebit: row.exemptDebit,
    exemptPrepaid: row.exemptPrepaid,
    customerDisclosureText: row.customerDisclosureText,
    receiptDisclosureText: row.receiptDisclosureText,
    prohibitedStates: (row.prohibitedStates as string[]) ?? [],
    glAccountId: row.glAccountId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * List all surcharge settings for a tenant, optionally filtered by provider.
 */
export async function listSurchargeSettings(
  tenantId: string,
  providerId?: string | null,
): Promise<SurchargeSettingsInfo[]> {
  return withTenant(tenantId, async (tx) => {
    const conditions = [eq(surchargeSettings.tenantId, tenantId)];
    if (providerId) {
      conditions.push(eq(surchargeSettings.providerId, providerId));
    }

    const rows = await tx
      .select()
      .from(surchargeSettings)
      .where(and(...conditions));

    return Array.from(rows as Iterable<typeof surchargeSettings.$inferSelect>).map(mapRow);
  });
}

/**
 * Get a specific surcharge settings row by ID.
 */
export async function getSurchargeSettings(
  tenantId: string,
  id: string,
): Promise<SurchargeSettingsInfo | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(surchargeSettings)
      .where(
        and(
          eq(surchargeSettings.tenantId, tenantId),
          eq(surchargeSettings.id, id),
        ),
      )
      .limit(1);

    if (!row) return null;
    return mapRow(row);
  });
}
