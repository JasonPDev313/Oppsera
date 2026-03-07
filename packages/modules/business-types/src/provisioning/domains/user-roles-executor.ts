import { eq, and } from 'drizzle-orm';
import { createAdminClient, roles, rolePermissions } from '@oppsera/db';
import { generateUlid } from '@oppsera/shared';
import { businessTypeRoleTemplates, businessTypeRolePermissions } from '../../schema';
import type { BlueprintDomainExecutor, ProvisioningContext, DomainProvisionResult, DomainValidationResult } from '../domain-registry';

export const userRolesExecutor: BlueprintDomainExecutor = {
  domainKey: 'user_roles',
  isCritical: false, // Failure here → partial, not fatal

  async validate(versionId: string): Promise<DomainValidationResult> {
    const db = createAdminClient();
    const roleTemplates = await db
      .select()
      .from(businessTypeRoleTemplates)
      .where(eq(businessTypeRoleTemplates.businessTypeVersionId, versionId));

    const errors: string[] = [];
    if (roleTemplates.length === 0) {
      errors.push('No role templates defined');
    }

    return { isValid: errors.length === 0, errors };
  },

  async provision(context: ProvisioningContext): Promise<DomainProvisionResult> {
    const adminDb = createAdminClient();
    let itemsProvisioned = 0;
    const createdRoles: string[] = [];

    try {
      const roleTemplates = await adminDb
        .select()
        .from(businessTypeRoleTemplates)
        .where(eq(businessTypeRoleTemplates.businessTypeVersionId, context.versionId));

      for (const template of roleTemplates) {
        // Idempotent: check if role with same key already exists for this tenant
        const [existingRole] = await adminDb
          .select({ id: roles.id })
          .from(roles)
          .where(
            and(
              eq(roles.tenantId, context.tenantId),
              eq(roles.name, template.roleName),
            ),
          )
          .limit(1);

        if (existingRole) {
          createdRoles.push(`${template.roleName} (skipped — already exists)`);
          continue;
        }

        // CLONE the role — never link. Template changes must never affect existing tenants.
        const newRoleId = generateUlid();
        const now = new Date();

        await adminDb.insert(roles).values({
          id: newRoleId,
          tenantId: context.tenantId,
          name: template.roleName,
          description: template.description,
          isSystem: false,
          createdAt: now,
        });

        // Clone permissions
        const templatePerms = await adminDb
          .select()
          .from(businessTypeRolePermissions)
          .where(eq(businessTypeRolePermissions.roleTemplateId, template.id));

        for (const perm of templatePerms) {
          await adminDb.insert(rolePermissions).values({
            id: generateUlid(),
            roleId: newRoleId,
            permission: perm.permissionKey,
          });
        }

        createdRoles.push(template.roleKey);
        itemsProvisioned++;
      }

      return {
        success: true,
        itemsProvisioned,
        details: { roles: createdRoles },
      };
    } catch (err) {
      return {
        success: false,
        itemsProvisioned,
        details: { roles: createdRoles },
        error: (err as Error).message,
      };
    }
  },

  async snapshot(versionId: string): Promise<Record<string, unknown>> {
    const db = createAdminClient();
    const roleTemplates = await db
      .select()
      .from(businessTypeRoleTemplates)
      .where(eq(businessTypeRoleTemplates.businessTypeVersionId, versionId));

    const rolesWithPerms = await Promise.all(
      roleTemplates.map(async (role) => {
        const perms = await db
          .select()
          .from(businessTypeRolePermissions)
          .where(eq(businessTypeRolePermissions.roleTemplateId, role.id));

        return {
          ...role,
          permissions: perms.map((p) => p.permissionKey),
        };
      }),
    );

    return { roleTemplates: rolesWithPerms };
  },
};
