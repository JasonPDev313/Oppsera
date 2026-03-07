import { eq, and, inArray } from 'drizzle-orm';
import { createAdminClient } from '@oppsera/db';
import { businessTypeRoleTemplates, businessTypeRolePermissions } from '../schema';

export async function listRoleTemplates(versionId: string) {
  const db = createAdminClient();
  const roles = await db
    .select()
    .from(businessTypeRoleTemplates)
    .where(eq(businessTypeRoleTemplates.businessTypeVersionId, versionId))
    .orderBy(businessTypeRoleTemplates.sortOrder);

  if (roles.length === 0) return [];

  // Batch-load all permissions in one query instead of N+1
  const roleIds = roles.map((r) => r.id);
  const allPerms = await db
    .select()
    .from(businessTypeRolePermissions)
    .where(inArray(businessTypeRolePermissions.roleTemplateId, roleIds));

  const permsByRole = new Map<string, string[]>();
  for (const perm of allPerms) {
    const arr = permsByRole.get(perm.roleTemplateId) ?? [];
    arr.push(perm.permissionKey);
    permsByRole.set(perm.roleTemplateId, arr);
  }

  return roles.map((role) => ({
    ...role,
    permissions: permsByRole.get(role.id) ?? [],
  }));
}

export async function getRoleTemplate(roleTemplateId: string, versionId?: string) {
  const db = createAdminClient();

  const conditions = [eq(businessTypeRoleTemplates.id, roleTemplateId)];
  if (versionId) {
    conditions.push(eq(businessTypeRoleTemplates.businessTypeVersionId, versionId));
  }

  const [role] = await db
    .select()
    .from(businessTypeRoleTemplates)
    .where(and(...conditions))
    .limit(1);

  if (!role) return null;

  const permissions = await db
    .select()
    .from(businessTypeRolePermissions)
    .where(eq(businessTypeRolePermissions.roleTemplateId, role.id));

  return {
    ...role,
    permissions: permissions.map((p) => p.permissionKey),
  };
}
