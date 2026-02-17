import { z } from 'zod';
import { eq, and, sql as drizzleSql } from 'drizzle-orm';
import {
  withTenant,
  roles,
  rolePermissions,
  roleAssignments,
  memberships,
  locations,
} from '@oppsera/db';
import { ValidationError, ConflictError, NotFoundError } from '@oppsera/shared';
import { getPermissionEngine } from './engine';

// ── Schemas ──────────────────────────────────────────────────────

const createRoleSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(100).transform((v) => v.trim()),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().min(1)).min(1),
});

const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1).max(100).transform((v) => v.trim()).optional(),
  description: z.string().max(500).optional(),
  permissions: z.array(z.string().min(1)).min(1).optional(),
});

const assignRoleSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  roleId: z.string().min(1),
  locationId: z.string().optional(),
});

const revokeRoleSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  roleId: z.string().min(1),
  locationId: z.string().optional(),
});

// ── Commands ─────────────────────────────────────────────────────

export async function createRole(input: z.input<typeof createRoleSchema>) {
  const parsed = createRoleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Validation failed',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  const { tenantId, name, description, permissions } = parsed.data;

  return withTenant(tenantId, async (tx) => {
    // Check uniqueness (case-insensitive)
    const existing = await tx.query.roles.findFirst({
      where: and(
        eq(roles.tenantId, tenantId),
        drizzleSql`LOWER(${roles.name}) = LOWER(${name})`,
      ),
    });
    if (existing) {
      throw new ConflictError(`Role "${name}" already exists`);
    }

    const [role] = await tx
      .insert(roles)
      .values({ tenantId, name, description, isSystem: false })
      .returning();

    await tx.insert(rolePermissions).values(
      permissions.map((permission) => ({ roleId: role!.id, permission })),
    );

    return { ...role!, permissions };
  });
}

export async function updateRole(input: z.input<typeof updateRoleSchema>) {
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Validation failed',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  const { roleId, tenantId, name, description, permissions } = parsed.data;

  return withTenant(tenantId, async (tx) => {
    const role = await tx.query.roles.findFirst({
      where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
    });
    if (!role) {
      throw new NotFoundError('Role', roleId);
    }

    // System role restrictions
    if (role.isSystem) {
      if (name && name !== role.name) {
        throw new ConflictError('Cannot rename a system role');
      }
      if (role.name === 'owner' && permissions) {
        throw new ConflictError('Cannot modify owner role permissions');
      }
    }

    // Check name uniqueness if changing name
    if (name && name !== role.name) {
      const existing = await tx.query.roles.findFirst({
        where: and(
          eq(roles.tenantId, tenantId),
          drizzleSql`LOWER(${roles.name}) = LOWER(${name})`,
        ),
      });
      if (existing) {
        throw new ConflictError(`Role "${name}" already exists`);
      }
    }

    // Update role fields
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length > 0) {
      await tx.update(roles).set(updates).where(eq(roles.id, roleId));
    }

    // Replace permissions if provided
    if (permissions) {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      await tx.insert(rolePermissions).values(
        permissions.map((permission) => ({ roleId, permission })),
      );
    }

    // Invalidate cache for all users with this role
    const assignments = await tx.query.roleAssignments.findMany({
      where: eq(roleAssignments.roleId, roleId),
    });
    const engine = getPermissionEngine();
    for (const assignment of assignments) {
      await engine.invalidateCache(tenantId, assignment.userId);
    }

    const updatedPerms = permissions ??
      (await tx.query.rolePermissions.findMany({
        where: eq(rolePermissions.roleId, roleId),
      })).map((rp) => rp.permission);

    return {
      id: roleId,
      tenantId,
      name: name ?? role.name,
      description: description ?? role.description,
      isSystem: role.isSystem,
      permissions: updatedPerms,
    };
  });
}

export async function deleteRole(tenantId: string, roleId: string) {
  return withTenant(tenantId, async (tx) => {
    const role = await tx.query.roles.findFirst({
      where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
    });
    if (!role) {
      throw new NotFoundError('Role', roleId);
    }

    if (role.isSystem) {
      throw new ConflictError('Cannot delete system role');
    }

    // Invalidate cache for affected users
    const assignments = await tx.query.roleAssignments.findMany({
      where: eq(roleAssignments.roleId, roleId),
    });
    const engine = getPermissionEngine();
    for (const assignment of assignments) {
      await engine.invalidateCache(tenantId, assignment.userId);
    }

    // CASCADE deletes role_permissions and role_assignments
    await tx.delete(roles).where(eq(roles.id, roleId));
  });
}

export async function assignRole(input: z.input<typeof assignRoleSchema>) {
  const parsed = assignRoleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Validation failed',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  const { tenantId, userId, roleId, locationId } = parsed.data;

  return withTenant(tenantId, async (tx) => {
    // Validate user has active membership
    const membership = await tx.query.memberships.findFirst({
      where: and(
        eq(memberships.tenantId, tenantId),
        eq(memberships.userId, userId),
        eq(memberships.status, 'active'),
      ),
    });
    if (!membership) {
      throw new NotFoundError('User membership');
    }

    // Validate role belongs to tenant
    const role = await tx.query.roles.findFirst({
      where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
    });
    if (!role) {
      throw new NotFoundError('Role', roleId);
    }

    // Validate location if provided
    if (locationId) {
      const location = await tx.query.locations.findFirst({
        where: and(
          eq(locations.id, locationId),
          eq(locations.tenantId, tenantId),
          eq(locations.isActive, true),
        ),
      });
      if (!location) {
        throw new NotFoundError('Location', locationId);
      }
    }

    // Check for duplicate assignment
    const existing = await tx.query.roleAssignments.findFirst({
      where: and(
        eq(roleAssignments.tenantId, tenantId),
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.roleId, roleId),
        locationId
          ? eq(roleAssignments.locationId, locationId)
          : drizzleSql`${roleAssignments.locationId} IS NULL`,
      ),
    });
    if (existing) {
      throw new ConflictError('Role assignment already exists');
    }

    const [assignment] = await tx
      .insert(roleAssignments)
      .values({ tenantId, userId, roleId, locationId: locationId ?? null })
      .returning();

    // Invalidate permission cache
    const engine = getPermissionEngine();
    await engine.invalidateCache(tenantId, userId);

    return assignment!;
  });
}

export async function revokeRole(input: z.input<typeof revokeRoleSchema>) {
  const parsed = revokeRoleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Validation failed',
      parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  const { tenantId, userId, roleId, locationId } = parsed.data;

  return withTenant(tenantId, async (tx) => {
    // Check: cannot revoke the last owner role
    const role = await tx.query.roles.findFirst({
      where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
    });
    if (!role) {
      throw new NotFoundError('Role', roleId);
    }

    if (role.name === 'owner') {
      const ownerAssignments = await tx.query.roleAssignments.findMany({
        where: and(
          eq(roleAssignments.tenantId, tenantId),
          eq(roleAssignments.roleId, roleId),
        ),
      });
      if (ownerAssignments.length <= 1) {
        throw new ConflictError('Cannot revoke the last owner role from the tenant');
      }
    }

    // Find and delete the assignment
    const assignment = await tx.query.roleAssignments.findFirst({
      where: and(
        eq(roleAssignments.tenantId, tenantId),
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.roleId, roleId),
        locationId
          ? eq(roleAssignments.locationId, locationId)
          : drizzleSql`${roleAssignments.locationId} IS NULL`,
      ),
    });
    if (!assignment) {
      throw new NotFoundError('Role assignment');
    }

    await tx.delete(roleAssignments).where(eq(roleAssignments.id, assignment.id));

    // Invalidate permission cache
    const engine = getPermissionEngine();
    await engine.invalidateCache(tenantId, userId);
  });
}
