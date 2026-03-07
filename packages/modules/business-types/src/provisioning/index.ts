import { registerDomain } from './domain-registry';
import { modulesExecutor } from './domains/modules-executor';
import { accountingExecutor } from './domains/accounting-executor';
import { userRolesExecutor } from './domains/user-roles-executor';

// Register V1 domain executors — order matters for provisioning
registerDomain(modulesExecutor);
registerDomain(accountingExecutor);
registerDomain(userRolesExecutor);

export { runProvisioningForTenant } from './runner';
export { getDomain, getRegisteredDomains } from './domain-registry';
export type {
  ProvisioningContext,
  DomainProvisionResult,
  DomainValidationResult,
  BlueprintDomainExecutor,
} from './domain-registry';
