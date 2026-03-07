import { createAdminClient } from '@oppsera/db';
import { eq, and, inArray } from 'drizzle-orm';
import {
  businessTypes,
  businessTypeVersions,
  businessTypeModuleDefaults,
  businessTypeAccountingTemplates,
  businessTypeRoleTemplates,
  businessTypeRolePermissions,
  businessCategories,
} from '../schema';
import { VALID_MODULE_KEYS, getModuleEntry } from '../registries/module-registry';
import { isValidPermissionKey } from '../registries/permission-registry';

export type PublishValidationError = {
  domain: 'modules' | 'accounting' | 'user_roles' | 'metadata';
  code: string;
  message: string;
};

export type PublishValidationWarning = {
  domain: string;
  message: string;
};

export type PublishValidationResult = {
  isValid: boolean;
  errors: PublishValidationError[];
  warnings: PublishValidationWarning[];
};

export async function validateForPublish(versionId: string): Promise<PublishValidationResult> {
  const db = createAdminClient();
  const errors: PublishValidationError[] = [];
  const warnings: PublishValidationWarning[] = [];

  // Fetch version
  const [version] = await db
    .select()
    .from(businessTypeVersions)
    .where(eq(businessTypeVersions.id, versionId))
    .limit(1);

  if (!version) {
    errors.push({ domain: 'metadata', code: 'VERSION_NOT_FOUND', message: 'Version not found' });
    return { isValid: false, errors, warnings };
  }

  if (version.status !== 'draft') {
    errors.push({ domain: 'metadata', code: 'NOT_DRAFT', message: 'Only draft versions can be published' });
    return { isValid: false, errors, warnings };
  }

  // Fetch business type for metadata checks
  const [businessType] = await db
    .select()
    .from(businessTypes)
    .where(eq(businessTypes.id, version.businessTypeId))
    .limit(1);

  if (!businessType) {
    errors.push({ domain: 'metadata', code: 'BUSINESS_TYPE_NOT_FOUND', message: 'Parent business type not found' });
    return { isValid: false, errors, warnings };
  }

  // ── Metadata checks ──────────────────────────────────────────
  if (!businessType.name?.trim()) {
    errors.push({ domain: 'metadata', code: 'NAME_REQUIRED', message: 'Business type name is required' });
  }

  if (!businessType.slug || !/^[a-z0-9-]+$/.test(businessType.slug)) {
    errors.push({ domain: 'metadata', code: 'INVALID_SLUG', message: 'Slug must be lowercase alphanumeric with hyphens' });
  }

  // Verify category exists
  const [category] = await db
    .select({ id: businessCategories.id })
    .from(businessCategories)
    .where(eq(businessCategories.id, businessType.categoryId))
    .limit(1);

  if (!category) {
    errors.push({ domain: 'metadata', code: 'INVALID_CATEGORY', message: 'Category does not exist' });
  }

  // ── Module checks ─────────────────────────────────────────────
  const modules = await db
    .select()
    .from(businessTypeModuleDefaults)
    .where(eq(businessTypeModuleDefaults.businessTypeVersionId, versionId));

  const enabledModules = modules.filter((m) => m.isEnabled);

  if (enabledModules.length === 0) {
    errors.push({ domain: 'modules', code: 'NO_MODULES_ENABLED', message: 'At least one module must be enabled' });
  }

  const enabledKeys = new Set(enabledModules.map((m) => m.moduleKey));

  for (const mod of enabledModules) {
    if (!VALID_MODULE_KEYS.has(mod.moduleKey)) {
      errors.push({ domain: 'modules', code: 'INVALID_MODULE_KEY', message: `Unknown module key: ${mod.moduleKey}` });
      continue;
    }

    const entry = getModuleEntry(mod.moduleKey);
    if (entry) {
      for (const dep of entry.dependencies) {
        if (!enabledKeys.has(dep)) {
          errors.push({
            domain: 'modules',
            code: 'MISSING_DEPENDENCY',
            message: `Module '${mod.moduleKey}' requires '${dep}' to be enabled`,
          });
        }
      }
    }
  }

  // ── Accounting checks ─────────────────────────────────────────
  const [acct] = await db
    .select()
    .from(businessTypeAccountingTemplates)
    .where(eq(businessTypeAccountingTemplates.businessTypeVersionId, versionId))
    .limit(1);

  const accountingModulesEnabled = ['accounting', 'ap', 'ar'].some((k) => enabledKeys.has(k));
  if (!acct) {
    if (accountingModulesEnabled) {
      errors.push({ domain: 'accounting', code: 'TEMPLATE_REQUIRED', message: 'Accounting template is required when accounting/AP/AR modules are enabled' });
    } else {
      warnings.push({ domain: 'accounting', message: 'No accounting template configured' });
    }
  } else {
    if (acct.validationStatus === 'invalid') {
      errors.push({ domain: 'accounting', code: 'TEMPLATE_INVALID', message: 'Accounting template has validation errors' });
    }
    if (!['disabled', 'perpetual', 'periodic'].includes(acct.cogsBehavior)) {
      errors.push({ domain: 'accounting', code: 'INVALID_COGS', message: 'Invalid COGS behavior value' });
    }

    // Cross-domain warning: COGS perpetual needs inventory module
    if (acct.cogsBehavior === 'perpetual' && !enabledKeys.has('inventory')) {
      warnings.push({
        domain: 'accounting',
        message: 'COGS perpetual mode is selected but Inventory module is not enabled',
      });
    }
  }

  // ── Role checks ───────────────────────────────────────────────
  const roles = await db
    .select()
    .from(businessTypeRoleTemplates)
    .where(eq(businessTypeRoleTemplates.businessTypeVersionId, versionId));

  if (roles.length === 0) {
    errors.push({ domain: 'user_roles', code: 'NO_ROLES', message: 'At least one role template must be defined' });
  }

  // Check role key uniqueness (DB enforces this, but validate proactively)
  const roleKeys = new Set<string>();
  for (const role of roles) {
    if (roleKeys.has(role.roleKey)) {
      errors.push({ domain: 'user_roles', code: 'DUPLICATE_ROLE_KEY', message: `Duplicate role key: ${role.roleKey}` });
    }
    roleKeys.add(role.roleKey);
  }

  // Validate all permission keys across all roles (batch-loaded)
  if (roles.length > 0) {
    const roleIds = roles.map((r) => r.id);
    const allPerms = await db
      .select()
      .from(businessTypeRolePermissions)
      .where(inArray(businessTypeRolePermissions.roleTemplateId, roleIds));

    const roleKeyById = new Map(roles.map((r) => [r.id, r.roleKey]));
    for (const perm of allPerms) {
      if (!isValidPermissionKey(perm.permissionKey)) {
        errors.push({
          domain: 'user_roles',
          code: 'INVALID_PERMISSION_KEY',
          message: `Role '${roleKeyById.get(perm.roleTemplateId)}' has invalid permission: ${perm.permissionKey}`,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
