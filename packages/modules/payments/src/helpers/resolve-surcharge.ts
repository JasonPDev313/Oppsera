import { sql } from 'drizzle-orm';
import { withTenant, surchargeSettings } from '@oppsera/db';

/**
 * Resolved surcharge configuration after cascading lookup.
 */
export interface SurchargeConfig {
  id: string;
  isEnabled: boolean;
  surchargeRate: number;
  maxRate: number;
  applyToCreditOnly: boolean;
  exemptDebit: boolean;
  exemptPrepaid: boolean;
  glAccountId: string | null;
  customerDisclosureText: string | null;
  receiptDisclosureText: string | null;
  prohibitedStates: string[];
}

/**
 * Cascading surcharge config lookup:
 * 1. Terminal-specific (if terminalId provided)
 * 2. Location-specific
 * 3. Tenant-wide default
 *
 * Returns null if no surcharge config is found at any level.
 */
export async function resolveSurcharge(
  tenantId: string,
  providerId: string,
  locationId: string,
  terminalId?: string | null,
): Promise<SurchargeConfig | null> {
  return withTenant(tenantId, async (tx) => {
    // Query all candidate rows in one shot, ordered by specificity
    const rows = await tx
      .select()
      .from(surchargeSettings)
      .where(
        sql`${surchargeSettings.tenantId} = ${tenantId}
          AND ${surchargeSettings.providerId} = ${providerId}
          AND (
            ${surchargeSettings.locationId} IS NULL
            OR ${surchargeSettings.locationId} = ${locationId}
          )
          AND (
            ${surchargeSettings.terminalId} IS NULL
            ${terminalId ? sql`OR ${surchargeSettings.terminalId} = ${terminalId}` : sql``}
          )`,
      );

    if (rows.length === 0) return null;

    // Pick most specific: terminal > location > tenant
    const items = Array.from(rows as Iterable<typeof surchargeSettings.$inferSelect>);
    const terminalRow = terminalId
      ? items.find((r) => r.terminalId === terminalId)
      : undefined;
    const locationRow = items.find(
      (r) => r.locationId === locationId && !r.terminalId,
    );
    const tenantRow = items.find(
      (r) => !r.locationId && !r.terminalId,
    );

    const row = terminalRow ?? locationRow ?? tenantRow;
    if (!row) return null;

    return {
      id: row.id,
      isEnabled: row.isEnabled,
      surchargeRate: Number(row.surchargeRate),
      maxRate: Number(row.maxSurchargeRate),
      applyToCreditOnly: row.applyToCreditOnly,
      exemptDebit: row.exemptDebit,
      exemptPrepaid: row.exemptPrepaid,
      glAccountId: row.glAccountId,
      customerDisclosureText: row.customerDisclosureText,
      receiptDisclosureText: row.receiptDisclosureText,
      prohibitedStates: (row.prohibitedStates as string[]) ?? [],
    };
  });
}
