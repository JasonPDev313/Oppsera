import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthUser } from './index';

export interface RequestContext {
  user: AuthUser;
  tenantId: string;
  locationId?: string;
  requestId: string;
  isPlatformAdmin: boolean;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext {
  const ctx = requestContext.getStore();
  if (!ctx) {
    throw new Error('No request context available. Ensure middleware has been applied.');
  }
  return ctx;
}
