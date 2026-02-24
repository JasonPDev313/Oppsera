import { eq, and, sql as drizzleSql } from 'drizzle-orm';
import {
  db,
  roles,
  rolePermissions,
  roleAssignments,
  users,
  locations,
  roleLocationAccess,
  roleProfitCenterAccess,
  roleTerminalAccess,
} from '@oppsera/db';
import { NotFoundError } from '@oppsera/shared';
import { getPermissionEngine } from './engine';
import { matchPermission } from './engine';

export async function listRoles(tenantId: string) {
  const tenantRoles = await db.query.roles.findMany({
    where: eq(roles.tenantId, tenantId),
  });

  const result = [];
  for (const role of tenantRoles) {
    const perms = await db.query.rolePermissions.findMany({
      where: eq(rolePermissions.roleId, role.id),
    });

    const [countResult] = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(roleAssignments)
      .where(eq(roleAssignments.roleId, role.id));

    result.push({
      ...role,
      permissions: perms.map((p) => p.permission),
      userCount: countResult?.count ?? 0,
    });
  }

  return result;
}

export async function getRoleDetail(tenantId: string, roleId: string) {
  const role = await db.query.roles.findFirst({
    where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
  });
  if (!role) {
    throw new NotFoundError('Role', roleId);
  }

  const perms = await db.query.rolePermissions.findMany({
    where: eq(rolePermissions.roleId, roleId),
  });

  const assignments = await db.query.roleAssignments.findMany({
    where: eq(roleAssignments.roleId, roleId),
  });

  const assignedUsers = [];
  for (const assignment of assignments) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, assignment.userId),
    });
    if (user) {
      assignedUsers.push({
        id: user.id,
        email: user.email,
        name: user.name,
        locationId: assignment.locationId,
      });
    }
  }

  return {
    ...role,
    permissions: perms.map((p) => p.permission),
    assignedUsers,
  };
}

export async function getUserRoles(tenantId: string, userId: string) {
  const assignments = await db.query.roleAssignments.findMany({
    where: and(
      eq(roleAssignments.tenantId, tenantId),
      eq(roleAssignments.userId, userId),
    ),
  });

  const result = [];
  for (const assignment of assignments) {
    const role = await db.query.roles.findFirst({
      where: eq(roles.id, assignment.roleId),
    });
    if (!role) continue;

    const perms = await db.query.rolePermissions.findMany({
      where: eq(rolePermissions.roleId, role.id),
    });

    result.push({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      scope: assignment.locationId ? 'location' : 'tenant',
      locationId: assignment.locationId,
      permissions: perms.map((p) => p.permission),
    });
  }

  return result;
}

export async function getEffectivePermissions(
  tenantId: string,
  userId: string,
  locationId?: string,
) {
  const engine = getPermissionEngine();
  const permissionSet = await engine.getUserPermissions(tenantId, userId, locationId);

  // Get role assignments to show which role each permission came from
  const assignments = await db.query.roleAssignments.findMany({
    where: and(
      eq(roleAssignments.tenantId, tenantId),
      eq(roleAssignments.userId, userId),
    ),
  });

  const rolesInfo = [];
  for (const assignment of assignments) {
    // If locationId provided, only include tenant-wide + matching location roles
    if (locationId && assignment.locationId && assignment.locationId !== locationId) {
      continue;
    }
    if (!locationId && assignment.locationId) {
      continue;
    }

    const role = await db.query.roles.findFirst({
      where: eq(roles.id, assignment.roleId),
    });
    if (role) {
      rolesInfo.push({
        id: role.id,
        name: role.name,
        scope: assignment.locationId ? 'location' : 'tenant',
        locationId: assignment.locationId,
      });
    }
  }

  return {
    permissions: [...permissionSet],
    roles: rolesInfo,
  };
}

/**
 * Single joined query returning user's role assignments with role names and location names.
 * Used for the role selection screen.
 */
export async function getUserRoleAssignments(tenantId: string, userId: string) {
  const rows = await db.execute<{
    assignment_id: string;
    role_id: string;
    role_name: string;
    is_system: boolean;
    location_id: string | null;
    location_name: string | null;
  }>(drizzleSql`
    SELECT
      ra.id AS assignment_id,
      r.id AS role_id,
      r.name AS role_name,
      r.is_system,
      ra.location_id,
      l.name AS location_name
    FROM role_assignments ra
    JOIN roles r ON r.id = ra.role_id
    LEFT JOIN locations l ON l.id = ra.location_id
    WHERE ra.tenant_id = ${tenantId}
      AND ra.user_id = ${userId}
    ORDER BY r.name
  `) as unknown as {
    assignment_id: string;
    role_id: string;
    role_name: string;
    is_system: boolean;
    location_id: string | null;
    location_name: string | null;
  }[];

  return Array.from(rows as Iterable<typeof rows[number]>).map((row) => ({
    assignmentId: row.assignment_id,
    roleId: row.role_id,
    roleName: row.role_name,
    isSystem: row.is_system,
    scope: row.location_id ? ('location' as const) : ('tenant' as const),
    locationId: row.location_id,
    locationName: row.location_name,
  }));
}

/**
 * Returns the current access configuration for a role.
 * Empty arrays mean unrestricted (role sees everything at that level).
 */
export async function getRoleAccess(tenantId: string, roleId: string) {
  const role = await db.query.roles.findFirst({
    where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
  });
  if (!role) {
    throw new NotFoundError('Role', roleId);
  }

  const locationRows = await db.query.roleLocationAccess.findMany({
    where: and(
      eq(roleLocationAccess.roleId, roleId),
      eq(roleLocationAccess.tenantId, tenantId),
    ),
  });

  const profitCenterRows = await db.query.roleProfitCenterAccess.findMany({
    where: and(
      eq(roleProfitCenterAccess.roleId, roleId),
      eq(roleProfitCenterAccess.tenantId, tenantId),
    ),
  });

  const terminalRows = await db.query.roleTerminalAccess.findMany({
    where: and(
      eq(roleTerminalAccess.roleId, roleId),
      eq(roleTerminalAccess.tenantId, tenantId),
    ),
  });

  return {
    locationIds: locationRows.map((r) => r.locationId),
    profitCenterIds: profitCenterRows.map((r) => r.profitCenterId),
    terminalIds: terminalRows.map((r) => r.terminalId),
  };
}

/**
 * Returns locations accessible by a role.
 * Empty access = all locations returned (unrestricted).
 */
export async function getAccessibleLocationsForRole(tenantId: string, roleId: string) {
  const accessRows = await db.query.roleLocationAccess.findMany({
    where: and(
      eq(roleLocationAccess.roleId, roleId),
      eq(roleLocationAccess.tenantId, tenantId),
    ),
  });

  if (accessRows.length === 0) {
    // Unrestricted — return all active locations
    return db.query.locations.findMany({
      where: and(
        eq(locations.tenantId, tenantId),
        eq(locations.isActive, true),
      ),
    });
  }

  // Return only the allowed locations
  const allowedIds = accessRows.map((r) => r.locationId);
  const rows = await db.execute<{
    id: string;
    tenant_id: string;
    name: string;
    parent_location_id: string | null;
    location_type: string | null;
    is_active: boolean;
  }>(drizzleSql`
    SELECT id, tenant_id, name, parent_location_id, location_type, is_active
    FROM locations
    WHERE tenant_id = ${tenantId}
      AND is_active = true
      AND id = ANY(${allowedIds})
    ORDER BY name
  `) as unknown as {
    id: string;
    tenant_id: string;
    name: string;
    parent_location_id: string | null;
    location_type: string | null;
    is_active: boolean;
  }[];

  return Array.from(rows as Iterable<typeof rows[number]>).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    parentLocationId: row.parent_location_id,
    locationType: row.location_type,
    isActive: row.is_active,
  }));
}

/**
 * Returns profit centers accessible by a role at a given location.
 * Empty PC access = all PCs at that location returned.
 */
export async function getAccessibleProfitCentersForRole(
  tenantId: string,
  roleId: string,
  locationId: string,
) {
  const accessRows = await db.query.roleProfitCenterAccess.findMany({
    where: and(
      eq(roleProfitCenterAccess.roleId, roleId),
      eq(roleProfitCenterAccess.tenantId, tenantId),
    ),
  });

  if (accessRows.length === 0) {
    // Unrestricted — return all active PCs at this location
    const rows = await db.execute<{
      id: string;
      tenant_id: string;
      location_id: string;
      title: string;
      code: string | null;
      description: string | null;
      is_active: boolean;
    }>(drizzleSql`
      SELECT id, tenant_id, location_id, title, code, description, is_active
      FROM terminal_locations
      WHERE tenant_id = ${tenantId}
        AND location_id = ${locationId}
        AND is_active = true
      ORDER BY sort_order, title
    `) as unknown as {
      id: string;
      tenant_id: string;
      location_id: string;
      title: string;
      code: string | null;
      description: string | null;
      is_active: boolean;
    }[];

    return Array.from(rows as Iterable<typeof rows[number]>).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      locationId: row.location_id,
      name: row.title,
      code: row.code,
      description: row.description,
      isActive: row.is_active,
    }));
  }

  // Filtered — only allowed PCs at this location
  const allowedIds = accessRows.map((r) => r.profitCenterId);
  const rows = await db.execute<{
    id: string;
    tenant_id: string;
    location_id: string;
    title: string;
    code: string | null;
    description: string | null;
    is_active: boolean;
  }>(drizzleSql`
    SELECT id, tenant_id, location_id, title, code, description, is_active
    FROM terminal_locations
    WHERE tenant_id = ${tenantId}
      AND location_id = ${locationId}
      AND is_active = true
      AND id = ANY(${allowedIds})
    ORDER BY sort_order, title
  `) as unknown as {
    id: string;
    tenant_id: string;
    location_id: string;
    title: string;
    code: string | null;
    description: string | null;
    is_active: boolean;
  }[];

  return Array.from(rows as Iterable<typeof rows[number]>).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    name: row.title,
    code: row.code,
    description: row.description,
    isActive: row.is_active,
  }));
}

/**
 * Returns terminals accessible by a role at a given profit center.
 * Empty terminal access = all terminals at that PC returned.
 */
export async function getAccessibleTerminalsForRole(
  tenantId: string,
  roleId: string,
  profitCenterId: string,
) {
  const accessRows = await db.query.roleTerminalAccess.findMany({
    where: and(
      eq(roleTerminalAccess.roleId, roleId),
      eq(roleTerminalAccess.tenantId, tenantId),
    ),
  });

  if (accessRows.length === 0) {
    // Unrestricted — return all active terminals at this PC
    const rows = await db.execute<{
      id: string;
      tenant_id: string;
      terminal_location_id: string;
      name: string;
      terminal_number: number | null;
      device_identifier: string | null;
      is_active: boolean;
    }>(drizzleSql`
      SELECT id, tenant_id, terminal_location_id, name, terminal_number, device_identifier, is_active
      FROM terminals
      WHERE tenant_id = ${tenantId}
        AND terminal_location_id = ${profitCenterId}
        AND is_active = true
      ORDER BY terminal_number, name
    `) as unknown as {
      id: string;
      tenant_id: string;
      terminal_location_id: string;
      name: string;
      terminal_number: number | null;
      device_identifier: string | null;
      is_active: boolean;
    }[];

    return Array.from(rows as Iterable<typeof rows[number]>).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      profitCenterId: row.terminal_location_id,
      name: row.name,
      terminalNumber: row.terminal_number,
      deviceIdentifier: row.device_identifier,
      isActive: row.is_active,
    }));
  }

  // Filtered — only allowed terminals at this PC
  const allowedIds = accessRows.map((r) => r.terminalId);
  const rows = await db.execute<{
    id: string;
    tenant_id: string;
    terminal_location_id: string;
    name: string;
    terminal_number: number | null;
    device_identifier: string | null;
    is_active: boolean;
  }>(drizzleSql`
    SELECT id, tenant_id, terminal_location_id, name, terminal_number, device_identifier, is_active
    FROM terminals
    WHERE tenant_id = ${tenantId}
      AND terminal_location_id = ${profitCenterId}
      AND is_active = true
      AND id = ANY(${allowedIds})
    ORDER BY terminal_number, name
  `) as unknown as {
    id: string;
    tenant_id: string;
    terminal_location_id: string;
    name: string;
    terminal_number: number | null;
    device_identifier: string | null;
    is_active: boolean;
  }[];

  return Array.from(rows as Iterable<typeof rows[number]>).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    profitCenterId: row.terminal_location_id,
    name: row.name,
    terminalNumber: row.terminal_number,
    deviceIdentifier: row.device_identifier,
    isActive: row.is_active,
  }));
}

export { matchPermission };
