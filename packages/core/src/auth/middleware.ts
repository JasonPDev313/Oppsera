import {
  AuthenticationError,
  TenantSuspendedError,
  MembershipInactiveError,
  generateUlid,
} from '@oppsera/shared';
import { eq } from 'drizzle-orm';
import { db, tenants, guardedQuery } from '@oppsera/db';
import { getAuthAdapter } from './get-adapter';
import { verifyImpersonationToken, getActiveImpersonationSession } from './impersonation';
import type { ImpersonationInfo } from './impersonation';
import type { AuthUser } from './index';
import type { RequestContext } from './context';

// Private property to carry impersonation info from authenticate() to resolveTenant()
// without changing the AuthUser interface.
const IMPERSONATION_KEY = Symbol('impersonation');

export async function authenticate(request: Request): Promise<AuthUser> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    throw new AuthenticationError();
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Invalid authorization format');
  }

  const token = authHeader.slice(7);
  if (!token) {
    throw new AuthenticationError('Invalid authorization format');
  }

  // Check for impersonation token first
  const impClaims = verifyImpersonationToken(token);
  if (impClaims?.imp) {
    const session = await getActiveImpersonationSession(impClaims.imp.sessionId);
    if (!session) {
      throw new AuthenticationError('Impersonation session expired or invalid');
    }

    const [tenant] = await guardedQuery('auth:impersonationTenant', () =>
      db
        .select({ id: tenants.id, status: tenants.status })
        .from(tenants)
        .where(eq(tenants.id, impClaims.imp.tenantId))
        .limit(1),
    );

    if (!tenant) {
      throw new AuthenticationError('Impersonation tenant not found');
    }

    const user: AuthUser = {
      id: `admin:${impClaims.imp.adminId}`,
      email: impClaims.imp.adminEmail,
      name: session.adminName,
      tenantId: impClaims.imp.tenantId,
      tenantStatus: tenant.status,
      membershipStatus: 'active',
    };

    // Attach impersonation info via symbol property (not enumerable, not in AuthUser type)
    (user as any)[IMPERSONATION_KEY] = {
      adminId: impClaims.imp.adminId,
      adminEmail: impClaims.imp.adminEmail,
      sessionId: impClaims.imp.sessionId,
    } satisfies ImpersonationInfo;

    return user;
  }

  // Standard auth flow
  const adapter = getAuthAdapter();
  const user = await adapter.validateToken(token);

  if (!user) {
    throw new AuthenticationError('Invalid or expired token');
  }

  return user;
}

/** Extract impersonation info from an AuthUser (if present). */
export function getImpersonationFromUser(user: AuthUser): ImpersonationInfo | undefined {
  return (user as any)[IMPERSONATION_KEY];
}

export async function resolveTenant(user: AuthUser): Promise<RequestContext> {
  const impersonation = getImpersonationFromUser(user);

  if (impersonation) {
    // Impersonation bypasses tenant status and membership checks —
    // the admin has already been authorized by the admin portal.
    return {
      user,
      tenantId: user.tenantId,
      requestId: generateUlid(),
      isPlatformAdmin: true,
      impersonation,
    };
  }

  if (user.tenantStatus !== 'active') {
    throw new TenantSuspendedError();
  }

  if (user.membershipStatus !== 'active') {
    throw new MembershipInactiveError();
  }

  return {
    user,
    tenantId: user.tenantId,
    requestId: generateUlid(),
    isPlatformAdmin: false,
  };
}
