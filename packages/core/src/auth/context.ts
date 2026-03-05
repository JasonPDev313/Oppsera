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
  /**
   * Queue of non-critical work to run AFTER the HTTP response is sent.
   * Flushed by withMiddleware via next/server after().
   * Use deferWork(ctx, fn) to enqueue (audit logs, GL, cache invalidation, etc.)
   */
  _deferredWork?: (() => Promise<void>)[];
}

/**
 * Enqueue non-critical work to run after the HTTP response is sent.
 * Backed by next/server after() — Vercel keeps the function alive until all
 * deferred work completes. Safe replacement for `await auditLog(...)` after
 * a transaction commits.
 */
export function deferWork(ctx: RequestContext, fn: () => Promise<void>): void {
  if (!ctx._deferredWork) {
    ctx._deferredWork = [];
  }
  ctx._deferredWork.push(fn);
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext {
  const ctx = requestContext.getStore();
  if (!ctx) {
    throw new Error('No request context available. Ensure middleware has been applied.');
  }
  return ctx;
}
