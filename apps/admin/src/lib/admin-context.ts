import { generateUlid } from '@oppsera/shared';
import type { RequestContext } from '@oppsera/core';

interface AdminSession {
  adminId: string;
  email: string;
  name: string;
  role: string;
}

/**
 * Build a synthetic RequestContext for calling @oppsera/core services
 * from the admin portal (no real tenant auth session exists).
 */
export function buildAdminCtx(session: AdminSession, tenantId: string): RequestContext {
  return {
    user: {
      id: `admin:${session.adminId}`,
      email: session.email,
      name: session.name,
      tenantId,
      tenantStatus: 'active',
      membershipStatus: 'active',
    },
    tenantId,
    requestId: `admin-${generateUlid()}`,
    isPlatformAdmin: true,
  };
}
