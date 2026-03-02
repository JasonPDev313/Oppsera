import { sql } from 'drizzle-orm';
import { withTenant } from '@oppsera/db';

export interface ManageTabsSettings {
  id: string;
  tenantId: string;
  locationId: string | null;
  showManageTabsButton: boolean;
  requirePinForTransfer: boolean;
  requirePinForVoid: boolean;
  allowBulkAllServers: boolean;
  readOnlyForNonManagers: boolean;
  maxBulkSelection: number;
}

const DEFAULTS: Omit<ManageTabsSettings, 'id' | 'tenantId' | 'locationId'> = {
  showManageTabsButton: true,
  requirePinForTransfer: false,
  requirePinForVoid: true,
  allowBulkAllServers: false,
  readOnlyForNonManagers: false,
  maxBulkSelection: 50,
};

export async function getManageTabsSettings(
  tenantId: string,
  locationId: string | null,
): Promise<ManageTabsSettings> {
  return withTenant(tenantId, async (tx) => {
    // Fetch location-specific + tenant-wide default in one query
    // ORDER BY location_id DESC NULLS LAST ensures location-specific row comes first
    const rows = await (tx as any).execute(sql`
      SELECT
        id,
        tenant_id,
        location_id,
        show_manage_tabs_button,
        require_pin_for_transfer,
        require_pin_for_void,
        allow_bulk_all_servers,
        read_only_for_non_managers,
        max_bulk_selection
      FROM fnb_manage_tabs_settings
      WHERE tenant_id = (select current_setting('app.current_tenant_id', true))
        AND (location_id = ${locationId} OR location_id IS NULL)
      ORDER BY location_id DESC NULLS LAST
      LIMIT 1
    `);

    const allRows = Array.from(rows as Iterable<Record<string, unknown>>);

    if (allRows.length === 0) {
      // Return hardcoded defaults
      return {
        id: '',
        tenantId,
        locationId: null,
        ...DEFAULTS,
      };
    }

    const r = allRows[0]!;
    return {
      id: r.id as string,
      tenantId: r.tenant_id as string,
      locationId: (r.location_id as string) ?? null,
      showManageTabsButton: r.show_manage_tabs_button != null
        ? Boolean(r.show_manage_tabs_button)
        : DEFAULTS.showManageTabsButton,
      requirePinForTransfer: r.require_pin_for_transfer != null
        ? Boolean(r.require_pin_for_transfer)
        : DEFAULTS.requirePinForTransfer,
      requirePinForVoid: r.require_pin_for_void != null
        ? Boolean(r.require_pin_for_void)
        : DEFAULTS.requirePinForVoid,
      allowBulkAllServers: r.allow_bulk_all_servers != null
        ? Boolean(r.allow_bulk_all_servers)
        : DEFAULTS.allowBulkAllServers,
      readOnlyForNonManagers: r.read_only_for_non_managers != null
        ? Boolean(r.read_only_for_non_managers)
        : DEFAULTS.readOnlyForNonManagers,
      maxBulkSelection: r.max_bulk_selection != null
        ? Number(r.max_bulk_selection)
        : DEFAULTS.maxBulkSelection,
    };
  });
}
