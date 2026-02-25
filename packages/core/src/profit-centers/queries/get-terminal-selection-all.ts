import { withTenant, sql, db, roleLocationAccess, roleProfitCenterAccess, roleTerminalAccess } from '@oppsera/db';
import { eq, and } from 'drizzle-orm';

interface SelectionLocation {
  id: string;
  name: string;
  locationType: 'site' | 'venue';
  parentLocationId: string | null;
}

interface SelectionProfitCenter {
  id: string;
  name: string;
  locationId: string;
  code: string | null;
  icon: string | null;
}

interface SelectionTerminal {
  id: string;
  name: string;
  profitCenterId: string;
  terminalNumber: number | null;
  deviceIdentifier: string | null;
}

export interface TerminalSelectionAllData {
  locations: SelectionLocation[];
  profitCenters: SelectionProfitCenter[];
  terminals: SelectionTerminal[];
}

/**
 * Single query that returns all locations, profit centers, and terminals
 * for the terminal selection screen. Applies role-based access scoping
 * if a roleId is provided.
 *
 * Replaces N+3 cascading API calls with 1.
 */
export async function getTerminalSelectionAll(
  tenantId: string,
  roleId?: string | null,
): Promise<TerminalSelectionAllData> {
  // Fetch role access restrictions + entity data in parallel
  const [accessRestrictions, entityData] = await Promise.all([
    // Role access rows (no RLS, use global db)
    roleId ? fetchRoleAccess(tenantId, roleId) : Promise.resolve(null),
    // Entity data (uses withTenant for RLS)
    withTenant(tenantId, async (tx) => {
      const [locRows, pcRows, termRows] = await Promise.all([
        tx.execute(sql`
          SELECT id, name, location_type, parent_location_id
          FROM locations
          WHERE tenant_id = ${tenantId} AND is_active = true
          ORDER BY location_type, name
        `),
        tx.execute(sql`
          SELECT id, title AS name, location_id, code, icon
          FROM terminal_locations
          WHERE tenant_id = ${tenantId} AND is_active = true
          ORDER BY sort_order, title
        `),
        tx.execute(sql`
          SELECT id, title AS name, terminal_location_id AS profit_center_id,
                 terminal_number, device_identifier
          FROM terminals
          WHERE tenant_id = ${tenantId} AND is_active = true
          ORDER BY terminal_number NULLS LAST, title
        `),
      ]);
      return { locRows, pcRows, termRows };
    }),
  ]);

  // Map rows
  let locations: SelectionLocation[] = Array.from(
    entityData.locRows as Iterable<Record<string, unknown>>,
  ).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    locationType: (r.location_type ? String(r.location_type) : 'site') as 'site' | 'venue',
    parentLocationId: r.parent_location_id ? String(r.parent_location_id) : null,
  }));

  let profitCenters: SelectionProfitCenter[] = Array.from(
    entityData.pcRows as Iterable<Record<string, unknown>>,
  ).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    locationId: String(r.location_id),
    code: r.code ? String(r.code) : null,
    icon: r.icon ? String(r.icon) : null,
  }));

  let terminals: SelectionTerminal[] = Array.from(
    entityData.termRows as Iterable<Record<string, unknown>>,
  ).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    profitCenterId: String(r.profit_center_id),
    terminalNumber: r.terminal_number != null ? Number(r.terminal_number) : null,
    deviceIdentifier: r.device_identifier ? String(r.device_identifier) : null,
  }));

  // Apply role-based access filtering (empty access table = unrestricted)
  if (accessRestrictions) {
    if (accessRestrictions.locationIds.length > 0) {
      const allowed = new Set(accessRestrictions.locationIds);
      locations = locations.filter((l) => allowed.has(l.id));
    }
    if (accessRestrictions.profitCenterIds.length > 0) {
      const allowed = new Set(accessRestrictions.profitCenterIds);
      profitCenters = profitCenters.filter((pc) => allowed.has(pc.id));
    }
    if (accessRestrictions.terminalIds.length > 0) {
      const allowed = new Set(accessRestrictions.terminalIds);
      terminals = terminals.filter((t) => allowed.has(t.id));
    }
  }

  return { locations, profitCenters, terminals };
}

/** Fetch all three role access tables in parallel. */
async function fetchRoleAccess(tenantId: string, roleId: string) {
  const [locAccess, pcAccess, termAccess] = await Promise.all([
    db.query.roleLocationAccess.findMany({
      where: and(
        eq(roleLocationAccess.roleId, roleId),
        eq(roleLocationAccess.tenantId, tenantId),
      ),
    }),
    db.query.roleProfitCenterAccess.findMany({
      where: and(
        eq(roleProfitCenterAccess.roleId, roleId),
        eq(roleProfitCenterAccess.tenantId, tenantId),
      ),
    }),
    db.query.roleTerminalAccess.findMany({
      where: and(
        eq(roleTerminalAccess.roleId, roleId),
        eq(roleTerminalAccess.tenantId, tenantId),
      ),
    }),
  ]);

  return {
    locationIds: locAccess.map((r) => r.locationId),
    profitCenterIds: pcAccess.map((r) => r.profitCenterId),
    terminalIds: termAccess.map((r) => r.terminalId),
  };
}
