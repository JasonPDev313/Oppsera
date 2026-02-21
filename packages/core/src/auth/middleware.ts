import {
  AuthenticationError,
  TenantSuspendedError,
  MembershipInactiveError,
  generateUlid,
} from '@oppsera/shared';
import { getAuthAdapter } from './get-adapter';
import type { AuthUser } from './index';
import type { RequestContext } from './context';

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

  const adapter = getAuthAdapter();
  const user = await adapter.validateToken(token);

  if (!user) {
    throw new AuthenticationError('Invalid or expired token');
  }

  return user;
}

export async function resolveTenant(user: AuthUser): Promise<RequestContext> {
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
    isPlatformAdmin: false, // Will be looked up from users table in a future enhancement
  };
}
