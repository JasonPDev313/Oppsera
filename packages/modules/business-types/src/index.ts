export const MODULE_KEY = 'business-types' as const;
export const MODULE_NAME = 'Business Type Manager';
export const MODULE_VERSION = '1.0.0';

export const MODULE_TABLES = [
  'business_categories',
  'business_types',
  'business_type_versions',
  'business_type_module_defaults',
  'business_type_accounting_templates',
  'business_type_role_templates',
  'business_type_role_permissions',
  'tenant_provisioning_runs',
  'tenant_provisioning_run_steps',
] as const;

// Schema
export * from './schema';

// Registries
export { MODULE_ENTRIES, VALID_MODULE_KEYS, getModuleEntry, getModulesByCategory } from './registries/module-registry';
export { VALID_PERMISSION_KEYS, isValidPermissionKey } from './registries/permission-registry';

// Types
export * from './types/schemas';

// Queries
export {
  listBusinessTypes,
  getBusinessType,
  getBusinessTypeBySlug,
  getPublishedVersion,
  getDraftVersion,
  getVersionById,
  listVersionHistory,
  listBusinessCategories,
} from './queries/business-type-queries';
export { getModuleDefaults } from './queries/module-defaults-queries';
export { getAccountingTemplate } from './queries/accounting-queries';
export { listRoleTemplates, getRoleTemplate } from './queries/role-template-queries';
export { listSignupBusinessTypes } from './queries/signup-queries';
export {
  getProvisioningRun,
  listProvisioningRunsForTenant,
  listProvisioningRunsForBusinessType,
  listProvisioningRunSteps,
} from './queries/provisioning-queries';

// Commands
export { createBusinessType } from './commands/create-business-type';
export { updateBusinessTypeMetadata } from './commands/update-business-type-metadata';
export { createDraftVersion, archiveVersion } from './commands/version-commands';
export { saveModuleDefaults } from './commands/module-default-commands';
export { saveAccountingTemplate } from './commands/accounting-commands';
export { saveRoleTemplate, deleteRoleTemplate } from './commands/role-template-commands';
export { publishVersion } from './commands/publish-version';

// Validators
export { validateForPublish } from './validators/publish-gate';
export type { PublishValidationResult, PublishValidationError, PublishValidationWarning } from './validators/publish-gate';

// Provisioning
export { runProvisioningForTenant, getDomain, getRegisteredDomains } from './provisioning';
export type { ProvisioningContext, DomainProvisionResult, BlueprintDomainExecutor } from './provisioning';
