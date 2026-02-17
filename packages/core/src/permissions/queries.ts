import { eq, and, sql as drizzleSql } from 'drizzle-orm';
import { db, roles, rolePermissions, roleAssignments, users } from '@oppsera/db';
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

export { matchPermission };
