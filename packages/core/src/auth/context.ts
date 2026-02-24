import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthUser } from './index';
import type { ImpersonationInfo } from './impersonation';

export interface RequestContext {
  user: AuthUser;
  tenantId: string;
  locationId?: string;
  /** When set, permissions are scoped to this single role (not the union of all roles). */
  activeRoleId?: string;
  requestId: string;
  isPlatformAdmin: boolean;
  impersonation?: ImpersonationInfo;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext {
  const ctx = requestContext.getStore();
  if (!ctx) {
    throw new Error('No request context available. Ensure middleware has been applied.');
  }
  return ctx;
}
