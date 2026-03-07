import { eq, and } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import {
  businessTypeRoleTemplates,
  businessTypeRolePermissions,
  businessTypeVersions,
} from '../schema';
import { isValidPermissionKey } from '../registries/permission-registry';
import type { RoleTemplateInput } from '../types/schemas';

export async function saveRoleTemplate(
  versionId: string,
  input: RoleTemplateInput,
  _adminUserId: string,
  existingRoleId?: string,
) {
  const db = createAdminClient();

  // Check version is editable
  const [version] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  if (!version) throw new Error('NOT_FOUND');
  if (version.status !== 'draft') throw new Error('VERSION_NOT_EDITABLE');

  // Validate permission keys
  const invalidPerms = input.permissions.filter((k) => !isValidPermissionKey(k));
  if (invalidPerms.length > 0) {
    throw new Error(`INVALID_PERMISSIONS:${invalidPerms.join(', ')}`);
  }

  const now = new Date();

  // If roleId provided (PUT /roles/:roleId), look up by ID and verify ownership.
  // If not provided (POST /roles), upsert by roleKey.
  let existingRole: typeof businessTypeRoleTemplates.$inferSelect | undefined;

  if (existingRoleId) {
    const [found] = await db
      .select()
      .from(businessTypeRoleTemplates)
      .where(eq(businessTypeRoleTemplates.id, existingRoleId))
      .limit(1);
    if (!found) throw new Error('ROLE_NOT_FOUND');
    if (found.businessTypeVersionId !== versionId) throw new Error('ROLE_VERSION_MISMATCH');
    existingRole = found;
  } else {
    const [found] = await db
      .select()
      .from(businessTypeRoleTemplates)
      .where(
        and(
          eq(businessTypeRoleTemplates.businessTypeVersionId, versionId),
          eq(businessTypeRoleTemplates.roleKey, input.roleKey),
        ),
      )
      .limit(1);
    existingRole = found;
  }

  let roleId: string;

  await db.transaction(async (tx) => {
    if (existingRole) {
      roleId = existingRole.id;
      await tx
        .update(businessTypeRoleTemplates)
        .set({
          roleName: input.roleName,
          roleKey: input.roleKey,
          description: input.description ?? null,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          updatedAt: now,
        })
        .where(eq(businessTypeRoleTemplates.id, existingRole.id));

      // Replace permissions
      await tx
        .delete(businessTypeRolePermissions)
        .where(eq(businessTypeRolePermissions.roleTemplateId, existingRole.id));
    } else {
      roleId = generateUlid();
      await tx.insert(businessTypeRoleTemplates).values({
        id: roleId,
        businessTypeVersionId: versionId,
        roleName: input.roleName,
        roleKey: input.roleKey,
        description: input.description ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Insert permissions
    for (const permKey of input.permissions) {
      await tx.insert(businessTypeRolePermissions).values({
        id: generateUlid(),
        roleTemplateId: roleId!,
        permissionKey: permKey,
        createdAt: now,
      });
    }
  });

  // Return updated role with permissions
  const [role] = await db
    .select()
    .from(businessTypeRoleTemplates)
    .where(eq(businessTypeRoleTemplates.id, roleId!))
    .limit(1);

  const perms = await db
    .select()
    .from(businessTypeRolePermissions)
    .where(eq(businessTypeRolePermissions.roleTemplateId, roleId!));

  return {
    ...role!,
    permissions: perms.map((p) => p.permissionKey),
  };
}

export async function deleteRoleTemplate(
  roleTemplateId: string,
  versionId: string,
  _adminUserId: string,
) {
  const db = createAdminClient();

  // Check version is editable
  const [version] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  if (!version) throw new Error('NOT_FOUND');
  if (version.status !== 'draft') throw new Error('VERSION_NOT_EDITABLE');

  const [role] = await db
    .select()
    .from(businessTypeRoleTemplates)
    .where(eq(businessTypeRoleTemplates.id, roleTemplateId))
    .limit(1);

  if (!role) throw new Error('ROLE_NOT_FOUND');
  if (role.businessTypeVersionId !== versionId) throw new Error('ROLE_VERSION_MISMATCH');

  // Cascade delete handles permissions via FK ON DELETE CASCADE
  await db
    .delete(businessTypeRoleTemplates)
    .where(eq(businessTypeRoleTemplates.id, roleTemplateId));
}
