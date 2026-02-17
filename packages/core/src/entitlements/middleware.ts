import { ModuleNotEnabledError } from '@oppsera/shared';
import type { RequestContext } from '../auth/context';
import { getEntitlementEngine } from './engine';

export function requireEntitlement(moduleKey: string) {
  return async (ctx: RequestContext): Promise<void> => {
    const engine = getEntitlementEngine();
    const isEnabled = await engine.isModuleEnabled(ctx.tenantId, moduleKey);

    if (!isEnabled) {
      throw new ModuleNotEnabledError(moduleKey);
    }
  };
}
