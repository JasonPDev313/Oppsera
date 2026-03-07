export type ProvisioningContext = {
  tenantId: string;
  businessTypeId: string;
  versionId: string;
  runId: string;
  adminUserId?: string;
};

export type DomainValidationResult = {
  isValid: boolean;
  errors: string[];
};

export type DomainProvisionResult = {
  success: boolean;
  itemsProvisioned: number;
  details: Record<string, unknown>;
  error?: string;
};

export type BlueprintDomainExecutor = {
  domainKey: string;
  isCritical: boolean;
  validate(versionId: string): Promise<DomainValidationResult>;
  provision(context: ProvisioningContext): Promise<DomainProvisionResult>;
  snapshot(versionId: string): Promise<Record<string, unknown>>;
};

const DOMAIN_REGISTRY = new Map<string, BlueprintDomainExecutor>();

export function registerDomain(executor: BlueprintDomainExecutor): void {
  DOMAIN_REGISTRY.set(executor.domainKey, executor);
}

export function getRegisteredDomains(): BlueprintDomainExecutor[] {
  return Array.from(DOMAIN_REGISTRY.values());
}

export function getDomain(key: string): BlueprintDomainExecutor | undefined {
  return DOMAIN_REGISTRY.get(key);
}

// Future domains — not implemented in V1, registered here as reference
// registerDomain(customerRolesExecutor)   // business_type_customer_role_templates
// registerDomain(inventoryExecutor)        // business_type_inventory_templates
// registerDomain(modifierExecutor)         // business_type_modifier_templates
// registerDomain(settingsExecutor)         // business_type_settings_templates
