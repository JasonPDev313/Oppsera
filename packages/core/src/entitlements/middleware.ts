import { ModuleNotEnabledError, ModuleViewOnlyError } from '@oppsera/shared';
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

export function requireEntitlementWrite(moduleKey: string) {
  return async (ctx: RequestContext): Promise<void> => {
    const engine = getEntitlementEngine();
    const mode = await engine.getAccessMode(ctx.tenantId, moduleKey);

    if (mode === 'off') {
      throw new ModuleNotEnabledError(moduleKey);
    }
    if (mode === 'view') {
      throw new ModuleViewOnlyError(moduleKey);
    }
  };
}
